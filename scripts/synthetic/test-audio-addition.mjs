import path from "node:path";

import { UseCase } from "../../dist/index.js";

import { createSyntheticFixture } from "./createSyntheticFixture.mjs";
import { assertMedia, probeMedia, runCommand } from "./utils.mjs";

export async function testAudioAddition() {
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
