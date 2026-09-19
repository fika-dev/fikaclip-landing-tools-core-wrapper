import assert from "node:assert/strict";
import path from "node:path";

import { FfmpegVideoAspectRatioRepository, UseCase } from "../../dist/index.js";

import { createSyntheticFixture } from "./createSyntheticFixture.mjs";
import { assertMedia, assertUseCaseExitCodeMinusOne, probeMedia, runCommand } from "./utils.mjs";

export async function testVideoAspectRatio() {
  await testBrowserWasmFfprobeFailureDoesNotInvokeFfprobe();

  const fixture = await createSyntheticFixture();
  const outputPath = path.join(fixture.workDir, "aspect-ratio.mp4");

  try {
    await assertUseCaseExitCodeMinusOne({
      label: "video aspect ratio use case",
      command: { sourcePath: fixture.inputPath, aspectRatio: "9:16" },
    });
    const useCase = new UseCase([new ProbeRepository(), new AspectRatioRepository(outputPath)]);
    const entity = await useCase.execute({
      command: { sourcePath: fixture.inputPath, aspectRatio: "9:16" },
    });

    await assertMedia(entity.result.path, {
      label: "video aspect ratio use case",
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      width: 320,
      height: 570,
    });
  } finally {
    await fixture.cleanup();
  }
}

async function testBrowserWasmFfprobeFailureDoesNotInvokeFfprobe() {
  const runtime = new BrowserWasmFailureRuntime();
  const repository = new FfmpegVideoAspectRatioRepository({
    coreURL: "https://example.invalid/ffmpeg-core.js",
    wasmURL: "https://example.invalid/ffmpeg-core.wasm",
    runtime,
  });
  const command = {
    source: { type: "blob", blob: new Blob([new Uint8Array([0])], { type: "video/mp4" }) },
    fileName: "browser-input.mp4",
    aspectRatio: "9:16",
  };

  await assert.rejects(
    () => repository.execute({ command, jobId: "browser-wasm-ffprobe-failure" }),
    /requires an inspected source format and codec profile/,
  );
  assert.equal(runtime.ffprobeCalls, 0);

  const result = await repository.execute({
    command: {
      ...command,
      output: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
    },
    jobId: "browser-wasm-profiled-transform",
  });
  assert.equal(result.result?.blob.size, 1);
}

class BrowserWasmFailureRuntime {
  ffprobeCalls = 0;

  onProgress() {}

  offProgress() {}

  async writeFile() {}

  async readFile() {
    return new Uint8Array([1]);
  }

  async deleteFile() {}

  async exec() {
    return 0;
  }

  async ffprobe() {
    this.ffprobeCalls += 1;
    return -1;
  }

  terminate() {}
}

class ProbeRepository {
  id = "synthetic-aspect-ratio-probe";

  async execute(entity) {
    return { ...entity, sourceProfile: await probeMedia(entity.command.sourcePath) };
  }
}

class AspectRatioRepository {
  id = "synthetic-aspect-ratio";

  constructor(outputPath) {
    this.outputPath = outputPath;
  }

  async execute(entity) {
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      entity.command.sourcePath,
      "-vf",
      "pad=ceil(max(iw\\,ih*9/16)/2)*2:ceil(max(ih\\,iw/(9/16))/2)*2:(ow-iw)/2:(oh-ih)/2:black",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-y",
      this.outputPath,
    ]);
    return { ...entity, result: { path: this.outputPath, sourceProfile: entity.sourceProfile } };
  }
}
