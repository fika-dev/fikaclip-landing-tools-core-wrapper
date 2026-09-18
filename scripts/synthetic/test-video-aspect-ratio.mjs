import path from "node:path";

import { UseCase } from "../../dist/index.js";

import { createSyntheticFixture } from "./createSyntheticFixture.mjs";
import { assertMedia, probeMedia, runCommand } from "./utils.mjs";

export async function testVideoAspectRatio() {
  const fixture = await createSyntheticFixture();
  const outputPath = path.join(fixture.workDir, "aspect-ratio.mp4");

  try {
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
