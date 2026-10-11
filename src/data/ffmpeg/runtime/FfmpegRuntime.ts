import { FFmpeg, type FileData, type ProgressEventCallback } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export type FfmpegRuntimeConfig =
  | {
      runtimeBaseUrl: string;
      coreURL?: never;
      wasmURL?: never;
    }
  | {
      runtimeBaseUrl?: never;
      coreURL: string;
      wasmURL: string;
    };

export class FfmpegRuntime {
  private ffmpeg: FFmpeg | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly config: FfmpegRuntimeConfig) {}

  async load() {
    const ffmpeg = this.getOrCreateFfmpeg();

    if (!this.loadPromise) {
      this.loadPromise = ffmpeg
        .load({
          coreURL: this.config.coreURL ?? `${this.config.runtimeBaseUrl}/ffmpeg-core.js`,
          wasmURL: this.config.wasmURL ?? `${this.config.runtimeBaseUrl}/ffmpeg-core.wasm`,
        })
        .then(() => undefined);
    }

    await this.loadPromise;
    return ffmpeg;
  }

  onProgress(callback: ProgressEventCallback) {
    this.getOrCreateFfmpeg().on("progress", callback);
  }

  offProgress(callback: ProgressEventCallback) {
    this.ffmpeg?.off("progress", callback);
  }

  async writeFile(path: string, source: string | File | Blob | Uint8Array, options?: { signal?: AbortSignal }) {
    const ffmpeg = await this.load();
    const data = source instanceof Uint8Array ? source : await fetchFile(source);
    await ffmpeg.writeFile(path, data, options);
  }

  async readFile(path: string, encoding?: string, options?: { signal?: AbortSignal }) {
    const ffmpeg = await this.load();
    return ffmpeg.readFile(path, encoding, options);
  }

  async deleteFile(path: string) {
    const ffmpeg = await this.load();
    await ffmpeg.deleteFile(path).catch(() => undefined);
  }

  async exec(args: string[], options?: { signal?: AbortSignal }) {
    const ffmpeg = await this.load();
    return ffmpeg.exec(args, undefined, options);
  }

  async ffprobe(args: string[], options?: { signal?: AbortSignal }) {
    const ffmpeg = await this.load();
    return ffmpeg.ffprobe(args, undefined, options);
  }

  terminate() {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.loadPromise = null;
  }

  private getOrCreateFfmpeg() {
    if (!this.ffmpeg) {
      this.ffmpeg = new FFmpeg();
    }

    return this.ffmpeg;
  }
}

export function readFfmpegText(data: FileData) {
  if (typeof data === "string") {
    return data;
  }

  return new TextDecoder().decode(data);
}

export function readFfmpegBytes(data: FileData) {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }

  return data;
}
