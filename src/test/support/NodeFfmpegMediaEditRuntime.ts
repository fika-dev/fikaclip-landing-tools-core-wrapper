import fs from "node:fs/promises";
import path from "node:path";

import type {
  MediaCommandRuntime,
  MediaFileData,
  MediaFileSource,
  MediaRuntimeProgressCallback,
} from "../../index";

import { spawnCommand } from "./spawnCommand";

/**
 * Drives the real `FfmpegMediaEditRepository` in Node by standing in for the
 * ffmpeg.wasm runtime: a temp directory plays the role of the in-memory FS, and
 * the system ffmpeg binary plays the role of the wasm core.
 *
 * The point is that the argument list stays untouched. Tests must never rebuild
 * the ffmpeg invocation themselves — if they did, they would verify the test's
 * idea of the command instead of the one `createArgs` actually produces.
 *
 * Progress callbacks are accepted to satisfy the runtime contract but never
 * fire, because the CLI's progress output is not parsed here.
 */
export class NodeFfmpegMediaEditRuntime implements MediaCommandRuntime {
  private readonly progressCallbacks = new Set<MediaRuntimeProgressCallback>();

  /** Exact argument list of the last `exec`, for failure diagnostics. */
  lastArgs: string[] = [];

  /** ffmpeg stderr of the last `exec`, which carries the real muxer error. */
  lastStderr = "";

  constructor(private readonly workDir: string) {}

  onProgress(callback: MediaRuntimeProgressCallback) {
    this.progressCallbacks.add(callback);
  }

  offProgress(callback: MediaRuntimeProgressCallback) {
    this.progressCallbacks.delete(callback);
  }

  async writeFile(filePath: string, source: MediaFileSource, options?: { signal?: AbortSignal }) {
    await fs.writeFile(this.resolve(filePath), await toBytes(source), { signal: options?.signal });
  }

  async readFile(filePath: string, _encoding?: string, options?: { signal?: AbortSignal }): Promise<MediaFileData> {
    const bytes = await fs.readFile(this.resolve(filePath), { signal: options?.signal });
    return new Uint8Array(bytes);
  }

  async deleteFile(filePath: string) {
    await fs.rm(this.resolve(filePath), { force: true });
  }

  async exec(args: string[], options?: { signal?: AbortSignal }): Promise<number> {
    this.lastArgs = args;

    // `-nostdin` only: every other flag comes from the repository under test.
    const outcome = await spawnCommand("ffmpeg", ["-nostdin", "-hide_banner", ...args], {
      cwd: this.workDir,
      signal: options?.signal,
    });

    this.lastStderr = outcome.stderr;
    return outcome.exitCode;
  }

  terminate() {
    this.progressCallbacks.clear();
  }

  private resolve(filePath: string) {
    return path.join(this.workDir, filePath);
  }
}

async function toBytes(source: MediaFileSource): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());

  throw new Error("The Node media-edit runtime only accepts Uint8Array or Blob sources, not URL strings.");
}
