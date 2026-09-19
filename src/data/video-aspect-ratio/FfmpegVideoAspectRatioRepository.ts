import type { FileData, ProgressEventCallback } from "@ffmpeg/ffmpeg";

import type {
  EditVideoAspectRatioEntity,
  MediaSource,
  AudioCodec,
  VideoCodec,
  VideoContainerFormat,
  VideoAspectRatio,
  VideoAspectRatioRepository,
} from "../../domain";
import { FfmpegRuntime, readFfmpegBytes, type FfmpegRuntimeConfig } from "../ffmpeg/FfmpegRuntime";

const MIME_TYPE_BY_FORMAT: Record<VideoContainerFormat, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

type AspectRatioRuntime = Pick<FfmpegRuntime, "writeFile" | "readFile" | "deleteFile" | "exec" | "onProgress" | "offProgress" | "terminate">;

export type FfmpegVideoAspectRatioRepositoryConfig = FfmpegRuntimeConfig & {
  runtime?: AspectRatioRuntime;
};

export class FfmpegVideoAspectRatioRepository implements VideoAspectRatioRepository {
  readonly id = "ffmpeg-video-aspect-ratio";

  private readonly runtime: AspectRatioRuntime;

  constructor(config: FfmpegVideoAspectRatioRepositoryConfig) {
    this.runtime = config.runtime ?? new FfmpegRuntime(config);
  }

  async execute(entity: EditVideoAspectRatioEntity): Promise<EditVideoAspectRatioEntity> {
    const { command, jobId } = entity;
    const inputPath = createInputPath(command.fileName, command.source);
    let output: ResolvedAspectRatioOutput | undefined;
    let outputPath: string | undefined;
    const progressCallback: ProgressEventCallback = ({ progress }) => {
      command.job?.onProgress?.({ jobId, phase: "transcoding", ratio: clampProgress(progress) });
    };
    let shouldTerminateRuntime = false;

    command.job?.onProgress?.({ jobId, phase: "transcoding", ratio: 0 });

    try {
      this.runtime.onProgress(progressCallback);
      await this.runtime.writeFile(inputPath, sourceToFileLike(command.source), { signal: command.job?.signal });
      output = requireCompleteOutput(command.output);
      if (output.videoCodec === "copy") {
        throw new Error("Video ratio editing requires a video codec because padding cannot be used with video copy.");
      }
      outputPath = createOutputPath(command.fileName, output.format);

      const exitCode = await this.runtime.exec(
        [
          "-i",
          inputPath,
          "-vf",
          buildCenterPadFilter(command.aspectRatio),
          "-c:v",
          toFfmpegVideoCodec(output.videoCodec),
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          ...(output.audioCodec === "none" ? ["-an"] : ["-c:a", toFfmpegAudioCodec(output.audioCodec)]),
          ...(output.format === "mp4" ? ["-movflags", "+faststart"] : []),
          outputPath,
        ],
        { signal: command.job?.signal },
      );

      if (exitCode !== 0) {
        throw new Error(`ffmpeg aspect ratio transform failed with exit code ${exitCode}.`);
      }

      const bytes = readFfmpegBytes(await this.runtime.readFile(outputPath, undefined, { signal: command.job?.signal }));
      const mimeType = MIME_TYPE_BY_FORMAT[output.format];
      const blob = new Blob([toBlobPart(bytes)], { type: mimeType });
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });

      return {
        ...entity,
        result: {
          blob,
          fileName: outputPath,
          mimeType,
          sizeBytes: blob.size,
          details: {
            aspectRatio: command.aspectRatio,
            output,
            warnings: ["원본 비율을 유지하고 목표 프레임을 검은 여백으로 채워 저장했습니다."],
          },
        },
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (isWasmMemoryAccessError(error)) {
        shouldTerminateRuntime = true;
        throw new Error("FFmpeg WebAssembly memory was exhausted while editing this video ratio.");
      }
      throw error;
    } finally {
      this.runtime.offProgress(progressCallback);
      if (shouldTerminateRuntime) {
        this.runtime.terminate();
      } else {
        await this.runtime.deleteFile(inputPath);
        if (outputPath) await this.runtime.deleteFile(outputPath);
      }
    }
  }

  dispose() {
    this.runtime.terminate();
  }
}

function buildCenterPadFilter(aspectRatio: VideoAspectRatio) {
  const target = { "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1, "4:3": 4 / 3 }[aspectRatio];
  const width = `ceil(max(iw\\,ih*${target})/2)*2`;
  const height = `ceil(max(ih\\,iw/${target})/2)*2`;
  return `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
}

function sourceToFileLike(source: MediaSource) {
  if (source.type === "file") return source.file;
  if (source.type === "blob") return source.blob;
  return source.url;
}

function createInputPath(fileName: string | undefined, source: MediaSource) {
  const name = fileName ?? (source.type === "file" ? source.file.name : "input.video");
  return sanitizeFileName(name);
}

function createOutputPath(fileName: string | undefined, format: VideoContainerFormat) {
  return `${sanitizeFileName(fileName ?? "video").replace(/\.[a-z0-9]+$/i, "")}.ratio.${format}`;
}

type SourceProfile = {
  format: VideoContainerFormat;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
};

type ResolvedAspectRatioOutput = SourceProfile;

function requireCompleteOutput(
  output: EditVideoAspectRatioEntity["command"]["output"],
): ResolvedAspectRatioOutput {
  if (!output?.format || !output.videoCodec || !output.audioCodec) {
    throw new Error("Video ratio editing requires an inspected source format and codec profile.");
  }

  return {
    format: output.format,
    videoCodec: output.videoCodec,
    audioCodec: output.audioCodec,
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

export function readVideoAspectRatioOutputBytes(data: FileData) {
  return readFfmpegBytes(data);
}
