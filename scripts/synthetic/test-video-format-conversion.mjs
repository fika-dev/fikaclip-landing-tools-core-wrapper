import path from "node:path";

import { UseCase } from "../../dist/index.js";

import { createSyntheticFixture } from "./createSyntheticFixture.mjs";
import { assertMedia, probeMedia, runCommand } from "./utils.mjs";

export async function testVideoFormatConversion() {
  const fixture = await createSyntheticFixture();
  const outputPath = path.join(fixture.workDir, "format-converted.webm");

  try {
    const useCase = new UseCase([new ProbeRepository(), new FormatConversionRepository(outputPath)]);
    const entity = await useCase.execute({
      command: {
        sourcePath: fixture.inputPath,
        output: { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
      },
    });

    await assertMedia(entity.result.path, {
      label: "video format conversion use case",
      format: "webm",
      videoCodec: "vp9",
      audioCodec: "opus",
    });
  } finally {
    await fixture.cleanup();
  }
}

class ProbeRepository {
  id = "synthetic-format-probe";

  async execute(entity) {
    return { ...entity, sourceProfile: await probeMedia(entity.command.sourcePath) };
  }
}

class FormatConversionRepository {
  id = "synthetic-format-conversion";

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
      "-c:v",
      "libvpx-vp9",
      "-c:a",
      "libopus",
      "-y",
      this.outputPath,
    ]);
    return { ...entity, result: { path: this.outputPath, sourceProfile: entity.sourceProfile } };
  }
}
