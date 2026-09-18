import type { FileData, ProgressEventCallback } from "@ffmpeg/ffmpeg";

import type {
  AudioCodec,
  ConvertVideoFormatEntity,
  MediaSource,
  MediaTranscodeRepository,
  ConvertVideoFormatPlan,
  VideoCodec,
  VideoContainerFormat,
} from "../../domain";
import { FfmpegRuntime, readFfmpegBytes, type FfmpegRuntimeConfig } from "../ffmpeg/FfmpegRuntime";

const MIME_TYPE_BY_FORMAT: Record<VideoContainerFormat, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

export type FfmpegVideoFormatTranscodeRepositoryConfig = FfmpegRuntimeConfig;

export class FfmpegVideoFormatTranscodeRepository implements MediaTranscodeRepository {
  readonly id = "ffmpeg-video-format-transcode";

  private readonly runtime: FfmpegRuntime;

  constructor(config: FfmpegVideoFormatTranscodeRepositoryConfig) {
    this.runtime = new FfmpegRuntime(config);
  }

  async execute(entity: ConvertVideoFormatEntity): Promise<ConvertVideoFormatEntity> {
    if (!entity.plan) {
      throw new Error("FFmpeg transcode repository requires a conversion plan.");
    }

    const { command, jobId, plan } = entity;
    command.job?.onProgress?.({
      jobId,
      phase: plan.mode === "remux" ? "remuxing" : "transcoding",
      ratio: 0,
    });

    const inputPath = createInputPath(command.fileName, command.source);
    const outputPath = createOutputPath(command.fileName, plan.output.format);
    const progressCallback: ProgressEventCallback = ({ progress }) => {
      command.job?.onProgress?.({ jobId, phase: "transcoding", ratio: clampProgress(progress) });
    };
    let shouldTerminateRuntime = false;

    try {
      this.runtime.onProgress(progressCallback);
      await this.runtime.writeFile(inputPath, sourceToFileLike(command.source), { signal: command.job?.signal });

      const exitCode = await this.runtime.exec(buildConvertArgs(inputPath, outputPath, plan), {
        signal: command.job?.signal,
      });

      if (exitCode !== 0) {
        throw new Error(`ffmpeg conversion failed with exit code ${exitCode}.`);
      }

      const data = await this.runtime.readFile(outputPath, undefined, { signal: command.job?.signal });
      const bytes = readFfmpegBytes(data);
      const blob = new Blob([toBlobPart(bytes)], { type: MIME_TYPE_BY_FORMAT[plan.output.format] });
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });

      return {
        ...entity,
        result: {
          blob,
          fileName: outputPath,
          mimeType: blob.type,
          sizeBytes: blob.size,
          details: plan,
        },
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (isWasmMemoryAccessError(error)) {
        shouldTerminateRuntime = true;
        throw new Error(
          "FFmpeg WebAssembly memory was exhausted while converting this video. Try a smaller file, a shorter clip, or a lighter codec.",
        );
      }

      throw error;
    } finally {
      this.runtime.offProgress(progressCallback);
      if (shouldTerminateRuntime) {
        this.runtime.terminate();
      } else {
        await this.runtime.deleteFile(inputPath);
        await this.runtime.deleteFile(outputPath);
      }
    }
  }

  dispose() {
    this.runtime.terminate();
  }
}

function buildConvertArgs(inputPath: string, outputPath: string, plan: ConvertVideoFormatPlan) {
  const args = ["-i", inputPath, "-map", "0"];

  if (plan.mode === "remux") {
    args.push("-c", "copy");
  } else {
    args.push("-threads", "1");
    args.push("-c:v", toFfmpegVideoCodec(plan.output.videoCodec));

    if (plan.output.audioCodec === "none") {
      args.push("-an");
    } else {
      args.push("-c:a", toFfmpegAudioCodec(plan.output.audioCodec));
    }

    if (plan.output.bitrate) {
      args.push("-b:v", String(plan.output.bitrate));
    }
  }

  args.push(outputPath);
  return args;
}

function sourceToFileLike(source: MediaSource) {
  if (source.type === "file") {
    return source.file;
  }

  if (source.type === "blob") {
    return source.blob;
  }

  return source.url;
}

function createInputPath(fileName: string | undefined, source: MediaSource) {
  return sanitizeFileName(fileName ?? getMediaSourceFileInfo(source, undefined).fileName ?? "input.video");
}

function createOutputPath(fileName: string | undefined, format: VideoContainerFormat) {
  const baseName = sanitizeFileName(fileName ?? "output").replace(/\.[a-z0-9]+$/i, "");
  return `${baseName}.converted.${format}`;
}

function getMediaSourceFileInfo(source: MediaSource, fileName: string | undefined) {
  if (source.type === "file") {
    return {
      fileName: fileName ?? source.file.name,
    };
  }

  if (source.type === "blob") {
    return { fileName };
  }

  return {
    fileName: fileName ?? source.url.split("/").pop()?.split("?")[0],
  };
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, progress));
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
  const message = String(error instanceof Error ? error.message : error);
  return /memory access out of bounds|out of memory|wasm memory|WebAssembly/i.test(message);
}

function toFfmpegVideoCodec(codec: VideoCodec) {
  const codecs: Record<VideoCodec, string> = {
    copy: "copy",
    h264: "libx264",
    h265: "libx265",
    vp8: "libvpx",
    vp9: "libvpx-vp9",
    av1: "libaom-av1",
  };

  return codecs[codec];
}

function toFfmpegAudioCodec(codec: Exclude<AudioCodec, "none">) {
  const codecs: Record<Exclude<AudioCodec, "none">, string> = {
    copy: "copy",
    aac: "aac",
    opus: "libopus",
    mp3: "libmp3lame",
  };

  return codecs[codec];
}

export function readFfmpegOutputBytes(data: FileData) {
  return readFfmpegBytes(data);
}
