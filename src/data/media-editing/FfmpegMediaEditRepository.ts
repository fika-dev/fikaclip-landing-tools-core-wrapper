import type { FileData, ProgressEventCallback } from "@ffmpeg/ffmpeg";

import type {
  AudioCodec,
  AudioFormat,
  MediaEditEntity,
  MediaEditRepository,
  MediaSource,
  VideoCodec,
  VideoContainerFormat,
} from "../../domain";
import { FfmpegRuntime, readFfmpegBytes, type FfmpegRuntimeConfig } from "../ffmpeg/FfmpegRuntime";

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

type MediaEditRuntime = Pick<FfmpegRuntime, "writeFile" | "readFile" | "deleteFile" | "exec" | "onProgress" | "offProgress" | "terminate">;

export type FfmpegMediaEditRepositoryConfig = FfmpegRuntimeConfig & {
  runtime?: MediaEditRuntime;
};

export class FfmpegMediaEditRepository implements MediaEditRepository {
  readonly id: string = "ffmpeg-media-edit";
  protected readonly runtime: MediaEditRuntime;

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    this.runtime = config.runtime ?? new FfmpegRuntime(config);
  }

  async execute(entity: MediaEditEntity): Promise<MediaEditEntity> {
    const { command, jobId } = entity;
    const inputPath = createInputPath(command.fileName, command.source);
    const extraPaths: string[] = [];
    const outputPath = createOutputPath(command.fileName, command);
    const progressCallback: ProgressEventCallback = ({ progress }) => {
      command.job?.onProgress?.({ jobId, phase: "transcoding", ratio: clamp(progress) });
    };
    let shouldTerminateRuntime = false;

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
        shouldTerminateRuntime = true;
        throw new Error("FFmpeg WebAssembly memory was exhausted while editing this media.");
      }
      throw error;
    } finally {
      this.runtime.offProgress(progressCallback);
      if (shouldTerminateRuntime) {
        this.runtime.terminate();
      } else {
        await Promise.all([inputPath, outputPath, ...extraPaths].map((path) => this.runtime.deleteFile(path)));
      }
    }
  }

  dispose() {
    this.runtime.terminate();
  }

  private async createArgs(
    command: MediaEditEntity["command"],
    inputPath: string,
    outputPath: string,
    extraPaths: string[],
  ) {
    switch (command.operation) {
      case "crop":
        return {
          args: [
            "-i",
            inputPath,
            "-vf",
            `crop=${even(command.region.width)}:${even(command.region.height)}:${even(command.region.x)}:${even(command.region.y)}`,
            "-c:v",
            toVideoCodec(command.output?.videoCodec ?? "h264"),
            ...(command.output?.audioCodec === "none"
              ? ["-an"]
              : ["-c:a", toAudioCodec(command.output?.audioCodec ?? "aac")]),
            outputPath,
          ],
          mimeType: VIDEO_MIME_TYPES[command.output?.format ?? inferVideoFormat(command.fileName)],
        };
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
      case "adjust-volume":
        return {
          args: [
            "-i",
            inputPath,
            "-vf",
            "null",
            "-af",
            buildVolumeFilter(command.segments),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            outputPath,
          ],
          mimeType: VIDEO_MIME_TYPES[inferVideoFormat(command.fileName)],
        };
      case "mute":
        return {
          args: command.muteAll
            ? ["-i", inputPath, "-c:v", "copy", "-an", outputPath]
            : [
                "-i",
                inputPath,
                "-af",
                buildMuteFilter(command.segments ?? []),
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                outputPath,
              ],
          mimeType: VIDEO_MIME_TYPES[inferVideoFormat(command.fileName)],
        };
      case "add-audio":
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
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            outputPath,
          ],
          mimeType: VIDEO_MIME_TYPES[inferVideoFormat(command.fileName)],
        };
      case "watermark":
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
            "-c:v",
            "libx264",
            "-c:a",
            "copy",
            outputPath,
          ],
          mimeType: VIDEO_MIME_TYPES[inferVideoFormat(command.fileName)],
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
  const extension = command.operation === "extract-audio" ? command.format : inferVideoFormat(fileName);
  return `${baseName}.${command.operation}.${extension}`;
}

function inferVideoFormat(fileName: string | undefined): VideoContainerFormat {
  const extension = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension === "webm" ? "webm" : extension === "mov" ? "mov" : extension === "mkv" ? "mkv" : "mp4";
}

function defaultAudioCodec(format: AudioFormat): Exclude<AudioCodec, "none" | "copy"> {
  return format === "mp3" ? "mp3" : format === "ogg" ? "opus" : "aac";
}

function toVideoCodec(codec: VideoCodec) {
  return { h264: "libx264", h265: "libx265", vp8: "libvpx", vp9: "libvpx-vp9", av1: "libaom-av1", copy: "copy" }[codec];
}

function toAudioCodec(codec: Exclude<AudioCodec, "none">) {
  return { aac: "aac", opus: "libopus", mp3: "libmp3lame", copy: "copy" }[codec];
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
