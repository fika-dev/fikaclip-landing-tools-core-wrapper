import type { ExtractAudioRepository, MediaEditEntity } from "../../domain";
import { FfmpegMediaEditRepository, type FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

export class FfmpegExtractAudioRepository extends FfmpegMediaEditRepository implements ExtractAudioRepository {
  readonly id = "ffmpeg-extract-audio";

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    super(config);
  }

  async execute(entity: MediaEditEntity) {
    if (entity.command.operation !== "extract-audio")
      throw new Error("Extract audio repository received an invalid command.");
    return super.execute(entity);
  }
}
