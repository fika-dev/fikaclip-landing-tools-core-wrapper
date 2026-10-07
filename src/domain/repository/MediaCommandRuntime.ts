/** Bytes a runtime hands back. A string only appears for text reads. */
export type MediaFileData = Uint8Array | string;

/** Anything a command can be fed from: raw bytes, a browser blob, or a URL. */
export type MediaFileSource = string | Uint8Array | Blob | File;

export type MediaRuntimeProgress = {
  progress: number;
  time: number;
};

export type MediaRuntimeProgressCallback = (progress: MediaRuntimeProgress) => void;

/**
 * The execution surface a repository needs, and nothing more.
 *
 * Deliberately missing: `terminate`. A runtime holds the expensive, stateful
 * part of this library — in the browser each one loads a ~31 MB WebAssembly core
 * into its own worker — so it is owned by whoever composed the use case, not by
 * the repositories using it. One shared runtime serves every operation, and a
 * repository that could tear it down would be tearing down work that belongs to
 * its siblings. Leaving the method off the contract makes that a compile error
 * rather than a convention.
 *
 * Vendor-neutral on purpose: the domain names the capability, and `FfmpegRuntime`
 * in the data layer is one implementation of it.
 */
export interface MediaCommandRuntime {
  writeFile(path: string, source: MediaFileSource, options?: { signal?: AbortSignal }): Promise<void>;
  readFile(path: string, encoding?: string, options?: { signal?: AbortSignal }): Promise<MediaFileData>;
  deleteFile(path: string): Promise<void>;
  exec(args: string[], options?: { signal?: AbortSignal }): Promise<number>;
  onProgress(callback: MediaRuntimeProgressCallback): void;
  offProgress(callback: MediaRuntimeProgressCallback): void;
}
