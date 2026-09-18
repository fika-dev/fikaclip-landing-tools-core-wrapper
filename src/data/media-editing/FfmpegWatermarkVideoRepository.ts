import type { MediaEditEntity, WatermarkVideoRepository } from "../../domain";
import { FfmpegMediaEditRepository, type FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

export class FfmpegWatermarkVideoRepository extends FfmpegMediaEditRepository implements WatermarkVideoRepository {
  readonly id = "ffmpeg-watermark-video";

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    super(config);
  }

  async execute(entity: MediaEditEntity) {
    if (entity.command.operation !== "watermark") throw new Error("Watermark repository received an invalid command.");
    return super.execute(entity);
  }
}
