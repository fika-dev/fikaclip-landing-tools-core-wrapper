import path from "node:path";

import { UseCase } from "../../dist/index.js";

import { createSyntheticFixture } from "./createSyntheticFixture.mjs";
import { assertMedia, assertUseCaseExitCodeMinusOne, probeMedia, runCommand } from "./utils.mjs";

export async function runMediaEditTest({ label, outputName, args, expected, extraSetup }) {
  const fixture = await createSyntheticFixture();
  const outputPath = path.join(fixture.workDir, outputName);

  try {
    await extraSetup?.(fixture);
    await assertUseCaseExitCodeMinusOne({
      label,
      command: { sourcePath: fixture.inputPath },
    });
    const useCase = new UseCase([new SyntheticProbeRepository(), new SyntheticMediaEditRepository(outputPath, args)]);
    const entity = await useCase.execute({ command: { sourcePath: fixture.inputPath }, jobId: label });
    await assertMedia(entity.result.path, { label, ...expected });
  } finally {
    await fixture.cleanup();
  }
}

class SyntheticProbeRepository {
  id = "synthetic-media-edit-probe";

  async execute(entity) {
    return { ...entity, sourceProfile: await probeMedia(entity.command.sourcePath) };
  }
}

class SyntheticMediaEditRepository {
  id = "synthetic-media-edit";

  constructor(outputPath, args) {
    this.outputPath = outputPath;
    this.args = args;
  }

  async execute(entity) {
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      entity.command.sourcePath,
      ...this.args,
      "-y",
      this.outputPath,
    ]);
    return { ...entity, result: { path: this.outputPath, sourceProfile: entity.sourceProfile } };
  }
}

export async function createSyntheticWatermark(fixture) {
  const watermarkPath = path.join(fixture.workDir, "watermark.png");
  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=40x40",
    "-frames:v",
    "1",
    "-y",
    watermarkPath,
  ]);
  return watermarkPath;
}
