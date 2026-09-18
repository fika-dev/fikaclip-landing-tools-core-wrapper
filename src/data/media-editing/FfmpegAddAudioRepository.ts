import type { AddAudioRepository, MediaEditEntity } from "../../domain";
import { FfmpegMediaEditRepository, type FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

export class FfmpegAddAudioRepository extends FfmpegMediaEditRepository implements AddAudioRepository {
  readonly id = "ffmpeg-add-audio";

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    super(config);
  }

  async execute(entity: MediaEditEntity) {
    if (entity.command.operation !== "add-audio") throw new Error("Add audio repository received an invalid command.");
    return super.execute(entity);
  }
}
