import path from "node:path";

import { UseCase } from "../../dist/index.js";

import { createSyntheticFixture } from "./createSyntheticFixture.mjs";
import { assertMedia, assertUseCaseExitCodeMinusOne, probeMedia, runCommand } from "./utils.mjs";

export async function testWatermark() {
  const fixture = await createSyntheticFixture();
  const watermarkPath = path.join(fixture.workDir, "watermark.png");
  const outputPath = path.join(fixture.workDir, "watermark.mp4");

  try {
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
    await assertUseCaseExitCodeMinusOne({
      label: "watermark use case",
      command: { sourcePath: fixture.inputPath },
    });
    const useCase = new UseCase([new WatermarkProbeRepository(), new WatermarkRepository(outputPath, watermarkPath)]);
    const entity = await useCase.execute({ command: { sourcePath: fixture.inputPath }, jobId: "watermark" });
    await assertMedia(entity.result.path, {
      label: "watermark use case",
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
    });
  } finally {
    await fixture.cleanup();
  }
}

class WatermarkProbeRepository {
  id = "synthetic-watermark-probe";

  async execute(entity) {
    return { ...entity, sourceProfile: await probeMedia(entity.command.sourcePath) };
  }
}

class WatermarkRepository {
  id = "synthetic-watermark";

  constructor(outputPath, watermarkPath) {
    this.outputPath = outputPath;
    this.watermarkPath = watermarkPath;
  }

  async execute(entity) {
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      entity.command.sourcePath,
      "-i",
      this.watermarkPath,
      "-filter_complex",
      "[0:v][1:v]overlay=10:10",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      "-y",
      this.outputPath,
    ]);
    return { ...entity, result: { path: this.outputPath, sourceProfile: entity.sourceProfile } };
  }
}
