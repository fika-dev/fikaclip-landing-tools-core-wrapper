import type { MediaEditEntity, MuteAudioRepository } from "../../domain";
import { FfmpegMediaEditRepository, type FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

export class FfmpegMuteAudioRepository extends FfmpegMediaEditRepository implements MuteAudioRepository {
  readonly id = "ffmpeg-mute-audio";

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    super(config);
  }

  async execute(entity: MediaEditEntity) {
    if (entity.command.operation !== "mute") throw new Error("Mute repository received an invalid command.");
    return super.execute(entity);
  }
}
