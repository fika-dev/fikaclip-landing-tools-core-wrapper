import type { CropVideoRepository, MediaEditEntity } from "../../domain";
import { FfmpegMediaEditRepository, type FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

export class FfmpegCropVideoRepository extends FfmpegMediaEditRepository implements CropVideoRepository {
  readonly id = "ffmpeg-crop-video";

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    super(config);
  }

  async execute(entity: MediaEditEntity) {
    if (entity.command.operation !== "crop") throw new Error("Crop repository received a non-crop command.");
    return super.execute(entity);
  }
}
