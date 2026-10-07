import { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";

export type TestRuntimeConfig = {
  runtime: NodeFfmpegMediaEditRuntime;
};

/**
 * The one and only place these tests depart from how an application uses this
 * library.
 *
 * Everything else — the repositories, the `UseCase` wiring, the commands, the
 * entities — is the real thing, imported from the package entry. Only the
 * execution backend differs: `FfmpegRuntime` drives ffmpeg.wasm through
 * `@ffmpeg/ffmpeg`, which needs the browser's `Worker` global and cannot run in
 * Node at all, so a Node-backed implementation of the same `MediaCommandRuntime`
 * contract takes its place and the repository's argument list is handed to the
 * system `ffmpeg` untouched.
 *
 * Note that passing a runtime is no longer a test-only affordance: repositories
 * require one, because a runtime holds a ~31 MB WebAssembly core and is owned by
 * whoever composed the use case. The tests and the app construct them the same
 * way.
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
 */
export function createTestRuntimeConfig(workDir: string): TestRuntimeConfig {
  return { runtime: new NodeFfmpegMediaEditRuntime(workDir) };
}
