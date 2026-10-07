import { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";

export type TestRuntimeConfig = {
  coreURL: string;
  wasmURL: string;
  runtime: NodeFfmpegMediaEditRuntime;
};

/**
 * The one and only place these tests depart from how an application uses this
 * library.
 *
 * Everything else — the repositories, the `UseCase` wiring, the commands, the
 * entities — is the real thing, imported from the package entry. Only the
 * execution backend is swapped: `FfmpegRuntime` drives ffmpeg.wasm through
 * `@ffmpeg/ffmpeg`, which needs the browser's `Worker` global and cannot run in
 * Node at all, so a Node-backed stand-in takes its place and the repository's
 * argument list is handed to the system `ffmpeg` untouched.
 *
 * What that means for what these tests prove:
 *
 * - proven: the orchestration, the commands, the arguments each repository
 *   builds, and how real media behaves when those arguments run;
 * - not proven: the ffmpeg.wasm transport layer (`FfmpegRuntime`, the worker,
 *   `@ffmpeg/core`) and the DOM-based `BrowserMediaProbeRepository`, both of
 *   which only exist in a browser.
 *
 * Closing that second gap needs a browser-driven test, not a Node one.
 *
 * The URLs below are deliberately unreachable: with `runtime` supplied,
 * `FfmpegRuntime` is never constructed, and a real URL here would hide an
 * accidental fall-through to ffmpeg.wasm instead of failing loudly.
 */
export function createTestRuntimeConfig(workDir: string): TestRuntimeConfig {
  return {
    coreURL: "https://example.invalid/ffmpeg-core.js",
    wasmURL: "https://example.invalid/ffmpeg-core.wasm",
    runtime: new NodeFfmpegMediaEditRuntime(workDir),
  };
}
