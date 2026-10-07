import type { FileData, ProgressEventCallback } from "@ffmpeg/ffmpeg";

import {
  assertOutputAudioCodec,
  assertOutputVideoCodec,
  resolveMediaOutputProfile,
  type MediaCommandRuntime,
  type MediaOutputIntent,
  type ResolvedMediaOutput,
  MediaRuntimeExhaustedError,
  type AudioCodec,
  type AudioFormat,
  type MediaEditEntity,
  type MediaEditRepository,
  type MediaSource,
  type OutputAudioCodec,
  type OutputVideoCodec,
  type VideoCodec,
  type VideoContainerFormat,
} from "../../domain";
import { readFfmpegBytes } from "../ffmpeg/FfmpegRuntime";

const VIDEO_MIME_TYPES: Record<VideoContainerFormat, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

const AUDIO_MIME_TYPES: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

export type FfmpegMediaEditRepositoryConfig = {
  runtime: MediaCommandRuntime;
};

export class FfmpegMediaEditRepository implements MediaEditRepository {
  readonly id: string = "ffmpeg-media-edit";
  protected readonly runtime: MediaCommandRuntime;

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    this.runtime = config.runtime;
  }

  async execute(entity: MediaEditEntity): Promise<MediaEditEntity> {
    const { command, jobId } = entity;
    const inputPath = createInputPath(command.fileName, command.source);
    const extraPaths: string[] = [];
    const outputPath = createOutputPath(command.fileName, command);
    const progressCallback: ProgressEventCallback = ({ progress }) => {
      command.job?.onProgress?.({ jobId, phase: "transcoding", ratio: clamp(progress) });
    };
    let runtimeUnusable = false;

    try {
      this.runtime.onProgress(progressCallback);
      await this.runtime.writeFile(inputPath, sourceToFileLike(command.source), { signal: command.job?.signal });

      const { args, mimeType } = await this.createArgs(command, inputPath, outputPath, extraPaths);
      const exitCode = await this.runtime.exec(args, { signal: command.job?.signal });
      if (exitCode !== 0) throw new Error(`ffmpeg ${command.operation} failed with exit code ${exitCode}.`);

      const bytes = readFfmpegBytes(
        await this.runtime.readFile(outputPath, undefined, { signal: command.job?.signal }),
      );
      const blob = new Blob([toBlobPart(bytes)], { type: mimeType });
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });

      return {
        ...entity,
        result: {
          blob,
          fileName: outputPath,
          mimeType,
          sizeBytes: blob.size,
          operation: command.operation,
          warnings: [],
        },
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (isWasmMemoryAccessError(error)) {
        runtimeUnusable = true;
        throw new MediaRuntimeExhaustedError(error);
      }
      throw error;
    } finally {
      this.runtime.offProgress(progressCallback);
      // An exhausted runtime may not answer another call, so its FS is left as
      // is; the owner decides whether to recycle it.
      if (!runtimeUnusable) {
        await Promise.all([inputPath, outputPath, ...extraPaths].map((path) => this.runtime.deleteFile(path)));
      }
    }
  }


  private async createArgs(
    command: MediaEditEntity["command"],
    inputPath: string,
    outputPath: string,
    extraPaths: string[],
  ) {
    const container = resolveOutputContainer(command);
    const profileFor = (intent: MediaOutputIntent) =>
      resolveMediaOutputProfile({
        format: container,
        intent,
        ...(command.operation === "extract-audio" ? {} : { requested: command.output }),
      });

    switch (command.operation) {
      case "crop": {
        // Cropping changes the frame, so the video has to be re-encoded.
        const profile = profileFor({ video: "reencode", audio: "reencode" });

        return {
          args: [
            "-i",
            inputPath,
            "-vf",
            `crop=${even(command.region.width)}:${even(command.region.height)}:${even(command.region.x)}:${even(command.region.y)}`,
            ...toCodecArgs(profile),
            outputPath,
          ],
          mimeType: VIDEO_MIME_TYPES[profile.format],
        };
      }
      case "extract-audio":
        return {
          args: [
            "-i",
            inputPath,
            "-vn",
            ...(command.audioTrackIndex === undefined ? [] : ["-map", `0:a:${command.audioTrackIndex}`]),
            "-c:a",
            toAudioCodec(command.audioCodec ?? defaultAudioCodec(command.format)),
            outputPath,
          ],
          mimeType: AUDIO_MIME_TYPES[command.format],
        };
      case "adjust-volume": {
        // The filter rewrites the samples, so audio is re-encoded; the picture is
        // untouched and can be copied.
        const profile = profileFor({ video: "copy", audio: "reencode" });

        return {
          args: ["-i", inputPath, "-af", buildVolumeFilter(command.segments), ...toCodecArgs(profile), outputPath],
          mimeType: VIDEO_MIME_TYPES[profile.format],
        };
      }
      case "mute": {
        // Muting everything removes the stream; muting ranges keeps it and has to
        // re-encode what is left.
        const profile = profileFor({ video: "copy", audio: command.muteAll ? "drop" : "reencode" });

        return {
          args: command.muteAll
            ? ["-i", inputPath, ...toCodecArgs(profile), outputPath]
            : ["-i", inputPath, "-af", buildMuteFilter(command.segments ?? []), ...toCodecArgs(profile), outputPath],
          mimeType: VIDEO_MIME_TYPES[profile.format],
        };
      }
      case "add-audio":
        // The mix is new audio, so it is encoded; the picture is copied.
        const addAudioProfile = profileFor({ video: "copy", audio: "reencode" });
        if (command.tracks.length === 0 || command.tracks.length > 3) {
          throw new Error("Audio addition requires between one and three audio tracks.");
        }
        const trackArgs: string[] = ["-i", inputPath];
        command.tracks.forEach((track) => {
          if (track.loop) trackArgs.push("-stream_loop", "-1");
          const trackPath = createTrackPath(track.fileName, extraPaths.length);
          extraPaths.push(trackPath);
          trackArgs.push("-i", trackPath);
        });
        for (const [index, track] of command.tracks.entries()) {
          await this.runtime.writeFile(extraPaths[index], sourceToFileLike(track.source), {
            signal: command.job?.signal,
          });
        }
        return {
          args: [
            ...trackArgs,
            "-filter_complex",
            buildMixFilter(command.tracks.length, command.tracks),
            "-map",
            "0:v?",
            "-map",
            "[mixed]",
            ...toCodecArgs(addAudioProfile),
            "-shortest",
            outputPath,
          ],
          mimeType: VIDEO_MIME_TYPES[addAudioProfile.format],
        };
      case "watermark":
        // The overlay is drawn into the picture, so video is re-encoded; audio is
        // untouched and copied.
        const watermarkProfile = profileFor({ video: "reencode", audio: "copy" });
        const imagePath = createTrackPath(command.layer.fileName, 0);
        extraPaths.push(imagePath);
        await this.runtime.writeFile(imagePath, sourceToFileLike(command.layer.image), { signal: command.job?.signal });
        const scale =
          command.layer.width || command.layer.height
            ? `scale=${command.layer.width ?? -1}:${command.layer.height ?? -1},`
            : "";
        const opacity =
          command.layer.opacity === undefined ? "" : `colorchannelmixer=aa=${clamp(command.layer.opacity)},`;
        return {
          args: [
            "-i",
            inputPath,
            "-i",
            imagePath,
            "-filter_complex",
            `[1:v]${scale}${opacity}format=rgba[wm];[0:v][wm]overlay=${Math.max(0, command.layer.x)}:${Math.max(0, command.layer.y)}`,
            ...toCodecArgs(watermarkProfile),
            outputPath,
          ],
          mimeType: VIDEO_MIME_TYPES[watermarkProfile.format],
        };
    }
  }
}

function buildVolumeFilter(segments: { startSeconds: number; endSeconds: number; volume: number }[]) {
  if (segments.length === 0) return "volume=1";
  return segments
    .map(
      (segment) =>
        `volume=enable='between(t\\,${segment.startSeconds}\\,${segment.endSeconds})':volume=${Math.max(0, segment.volume)}`,
    )
    .join(",");
}

function buildMuteFilter(segments: { startSeconds: number; endSeconds: number }[]) {
  if (segments.length === 0) return "volume=1";
  return segments
    .map((segment) => `volume=enable='between(t\\,${segment.startSeconds}\\,${segment.endSeconds})':volume=0`)
    .join(",");
}

function buildMixFilter(count: number, tracks: { volume?: number; startSeconds?: number }[]) {
  const labels = tracks.map((track, index) => {
    const volume = track.volume === undefined ? "" : `volume=${Math.max(0, track.volume)},`;
    const delay = track.startSeconds
      ? `adelay=${Math.max(0, Math.round(track.startSeconds * 1000))}|${Math.max(0, Math.round(track.startSeconds * 1000))},`
      : "";
    return `[${index + 1}:a]${delay}${volume}aresample=async=1[a${index}]`;
  });
  return `${labels.join(";")};${tracks.map((_, index) => `[a${index}]`).join("")}amix=inputs=${count}:duration=longest:dropout_transition=0[mixed]`;
}

function sourceToFileLike(source: MediaSource) {
  if (source.type === "file") return source.file;
  if (source.type === "blob") return source.blob;
  return source.url;
}

function createInputPath(fileName: string | undefined, source: MediaSource) {
  const name = fileName ?? (source.type === "file" ? source.file.name : "input.video");
  return sanitize(name);
}

function createTrackPath(fileName: string | undefined, index: number) {
  return `${sanitize(fileName ?? `asset-${index}.bin`)}.${index}.input`;
}

function createOutputPath(fileName: string | undefined, command: MediaEditEntity["command"]) {
  const baseName = sanitize(fileName ?? "media").replace(/\.[a-z0-9]+$/i, "");
  const extension = command.operation === "extract-audio" ? command.format : resolveOutputContainer(command);
  return `${baseName}.${command.operation}.${extension}`;
}

/**
 * The container the output is actually written to.
 *
 * Resolved once and used for the file name, the reported MIME type and the codec
 * defaults alike. These used to be derived separately — the path from the input
 * file's extension and the MIME type from `output.format` — so asking for a
 * different container produced the original container wearing the requested
 * label.
 */
function resolveOutputContainer(command: MediaEditEntity["command"]): VideoContainerFormat {
  if (command.operation === "extract-audio") return inferVideoFormat(command.fileName);

  return command.output?.format ?? inferVideoFormat(command.fileName);
}

/** Turns a resolved profile into the codec flags, including stream removal. */
function toCodecArgs(profile: ResolvedMediaOutput): string[] {
  return [
    ...(profile.videoCodec === "none" ? ["-vn"] : ["-c:v", FFMPEG_VIDEO_ENCODERS[profile.videoCodec]]),
    ...(profile.audioCodec === "none" ? ["-an"] : ["-c:a", FFMPEG_AUDIO_ENCODERS[profile.audioCodec]]),
  ];
}

function inferVideoFormat(fileName: string | undefined): VideoContainerFormat {
  const extension = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension === "webm" ? "webm" : extension === "mov" ? "mov" : extension === "mkv" ? "mkv" : "mp4";
}

function defaultAudioCodec(format: AudioFormat): Exclude<AudioCodec, "none" | "copy"> {
  return format === "mp3" ? "mp3" : format === "ogg" ? "opus" : "aac";
}

const FFMPEG_VIDEO_ENCODERS: Record<OutputVideoCodec | "copy", string> = {
  h264: "libx264",
  h265: "libx265",
  vp8: "libvpx",
  vp9: "libvpx-vp9",
  copy: "copy",
};

const FFMPEG_AUDIO_ENCODERS: Record<OutputAudioCodec | "copy", string> = {
  aac: "aac",
  opus: "libopus",
  mp3: "libmp3lame",
  copy: "copy",
};

function toVideoCodec(codec: VideoCodec) {
  return FFMPEG_VIDEO_ENCODERS[assertOutputVideoCodec(codec)];
}

function toAudioCodec(codec: Exclude<AudioCodec, "none">) {
  return FFMPEG_AUDIO_ENCODERS[assertOutputAudioCodec(codec)];
}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toBlobPart(bytes: Uint8Array): BlobPart {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return new Uint8Array(bytes).buffer;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isWasmMemoryAccessError(error: unknown) {
  return /memory access out of bounds|out of memory|wasm memory|WebAssembly/i.test(String(error));
}
