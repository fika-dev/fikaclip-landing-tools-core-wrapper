import assert from "node:assert/strict";

import { FfmpegExtractAudioRepository } from "../../dist/index.js";
import { runMediaEditTest } from "./media-editing-test-utils.mjs";

export async function testAudioExtraction() {
  await testAudioExtractionExitCodeMinusOne();
  await testAudioExtractionSelectedTrack();

  await runMediaEditTest({
    label: "audio extraction use case",
    outputName: "audio.mp3",
    args: ["-vn", "-c:a", "libmp3lame"],
    expected: { format: "mp3", audioCodec: "mp3" },
  });
}

async function testAudioExtractionSelectedTrack() {
  const runtime = new CapturingRuntime();
  const repository = new FfmpegExtractAudioRepository({
    coreURL: "https://example.invalid/ffmpeg-core.js",
    wasmURL: "https://example.invalid/ffmpeg-core.wasm",
    runtime,
  });

  await repository.execute({
    jobId: "audio-extraction-track-selection",
    command: {
      operation: "extract-audio",
      source: { type: "blob", blob: new Blob([new Uint8Array([0])], { type: "video/mp4" }) },
      fileName: "input.mp4",
      format: "mp3",
      audioTrackIndex: 1,
    },
  });

  assert.deepEqual(runtime.args.slice(0, 7), ["-i", "input.mp4", "-vn", "-map", "0:a:1", "-c:a", "libmp3lame"]);
}

async function testAudioExtractionExitCodeMinusOne() {
  const runtime = new ExitCodeFailureRuntime();
  const repository = new FfmpegExtractAudioRepository({
    coreURL: "https://example.invalid/ffmpeg-core.js",
    wasmURL: "https://example.invalid/ffmpeg-core.wasm",
    runtime,
  });

  await assert.rejects(
    () =>
      repository.execute({
        jobId: "audio-extraction-exit-minus-one",
        command: {
          operation: "extract-audio",
          source: { type: "blob", blob: new Blob([new Uint8Array([0])], { type: "video/mp4" }) },
          fileName: "input.mp4",
          format: "mp3",
        },
      }),
    /ffmpeg extract-audio failed with exit code -1\./,
  );
}

class ExitCodeFailureRuntime {
  onProgress() {}

  offProgress() {}

  async writeFile() {}

  async readFile() {
    return new Uint8Array([1]);
  }

  async deleteFile() {}

  async exec() {
    return -1;
  }

  terminate() {}
}

class CapturingRuntime extends ExitCodeFailureRuntime {
  args = [];

  async exec(args) {
    this.args = args;
    return 0;
  }
}
