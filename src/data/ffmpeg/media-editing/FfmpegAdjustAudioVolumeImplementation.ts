import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import { FfmpegAdjustAudioVolumeRepository } from "./FfmpegAdjustAudioVolumeRepository";
import type { FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

const IMPLEMENTATION_ID = Symbol("ffmpeg-adjust-audio-volume");

export class FfmpegAdjustAudioVolumeImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "ffmpeg";
  readonly repositories;

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    this.repositories = [new FfmpegAdjustAudioVolumeRepository(config)];
  }

  assess(entity: MediaEditEntity, _context: MediaRoutingContext): RouteAssessment {
    return entity.command.operation === "adjust-volume"
      ? { supported: true, score: 10, reasons: ["portable-fallback"] }
      : { supported: false, score: 0, reasons: ["adjust-volume-required"] };
  }
}
