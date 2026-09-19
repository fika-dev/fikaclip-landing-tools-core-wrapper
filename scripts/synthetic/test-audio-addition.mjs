import assert from "node:assert/strict";
import path from "node:path";

import { FfmpegAddAudioRepository, UseCase } from "../../dist/index.js";

import { createSyntheticFixture } from "./createSyntheticFixture.mjs";
import { assertMedia, assertUseCaseExitCodeMinusOne, probeMedia, runCommand } from "./utils.mjs";

export async function testAudioAddition() {
  await testAudioAdditionExitCodeMinusOne();

  const fixture = await createSyntheticFixture();
  const trackPath = path.join(fixture.workDir, "track.wav");
  const outputPath = path.join(fixture.workDir, "audio-addition.mp4");

  try {
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "0.1",
      "-c:a",
      "pcm_s16le",
      "-y",
      trackPath,
    ]);
    await assertUseCaseExitCodeMinusOne({
      label: "audio addition use case",
      command: { sourcePath: fixture.inputPath },
    });
    const useCase = new UseCase([new AdditionProbeRepository(), new AdditionRepository(outputPath, trackPath)]);
    const entity = await useCase.execute({ command: { sourcePath: fixture.inputPath }, jobId: "audio-addition" });
    await assertMedia(entity.result.path, {
      label: "audio addition use case",
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
    });
  } finally {
    await fixture.cleanup();
  }
}

async function testAudioAdditionExitCodeMinusOne() {
  const runtime = new ExitCodeFailureRuntime();
  const repository = new FfmpegAddAudioRepository({
    coreURL: "https://example.invalid/ffmpeg-core.js",
    wasmURL: "https://example.invalid/ffmpeg-core.wasm",
    runtime,
  });

  await assert.rejects(
    () =>
      repository.execute({
        jobId: "audio-addition-exit-minus-one",
        command: {
          operation: "add-audio",
          source: { type: "blob", blob: new Blob([new Uint8Array([0])], { type: "video/mp4" }) },
          fileName: "input.mp4",
          tracks: [
            {
              source: { type: "blob", blob: new Blob([new Uint8Array([1])], { type: "audio/wav" }) },
              fileName: "track.wav",
            },
          ],
        },
      }),
    /ffmpeg add-audio failed with exit code -1\./,
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

class AdditionProbeRepository {
  id = "synthetic-audio-addition-probe";

  async execute(entity) {
    return { ...entity, sourceProfile: await probeMedia(entity.command.sourcePath) };
  }
}

class AdditionRepository {
  id = "synthetic-audio-addition";

  constructor(outputPath, trackPath) {
    this.outputPath = outputPath;
    this.trackPath = trackPath;
  }

  async execute(entity) {
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      entity.command.sourcePath,
      "-i",
      this.trackPath,
      "-filter_complex",
      "[0:a][1:a]amix=inputs=2:duration=first[mixed]",
      "-map",
      "0:v",
      "-map",
      "[mixed]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-y",
      this.outputPath,
    ]);
    return { ...entity, result: { path: this.outputPath, sourceProfile: entity.sourceProfile } };
  }
}
