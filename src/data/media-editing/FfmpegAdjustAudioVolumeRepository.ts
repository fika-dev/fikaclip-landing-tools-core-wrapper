import type { AdjustAudioVolumeRepository, MediaEditEntity } from "../../domain";
import { FfmpegMediaEditRepository, type FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

export class FfmpegAdjustAudioVolumeRepository
  extends FfmpegMediaEditRepository
  implements AdjustAudioVolumeRepository
{
  readonly id = "ffmpeg-adjust-audio-volume";

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    super(config);
  }

  async execute(entity: MediaEditEntity) {
    if (entity.command.operation !== "adjust-volume")
      throw new Error("Audio volume repository received an invalid command.");
    return super.execute(entity);
  }
}
