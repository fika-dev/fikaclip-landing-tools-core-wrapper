import assert from "node:assert/strict";

import { FfmpegAdjustAudioVolumeRepository } from "../../dist/index.js";
import { runMediaEditTest } from "./media-editing-test-utils.mjs";

export async function testAudioVolume() {
  await testAudioVolumeExitCodeMinusOne();

  await runMediaEditTest({
    label: "audio volume use case",
    outputName: "volume.mp4",
    args: ["-af", "volume=enable='between(t\\,0\\,0.05)':volume=0.5", "-c:v", "copy", "-c:a", "aac"],
    expected: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
  });
}

async function testAudioVolumeExitCodeMinusOne() {
  const repository = new FfmpegAdjustAudioVolumeRepository({
    coreURL: "https://example.invalid/ffmpeg-core.js",
    wasmURL: "https://example.invalid/ffmpeg-core.wasm",
    runtime: new ExitCodeFailureRuntime(),
  });

  await assert.rejects(
    () =>
      repository.execute({
        jobId: "audio-volume-exit-minus-one",
        command: {
          operation: "adjust-volume",
          source: { type: "blob", blob: new Blob([new Uint8Array([0])], { type: "video/mp4" }) },
          fileName: "input.mp4",
          segments: [{ startSeconds: 0, endSeconds: 1, volume: 0.5 }],
        },
      }),
    /ffmpeg adjust-volume failed with exit code -1\./,
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
