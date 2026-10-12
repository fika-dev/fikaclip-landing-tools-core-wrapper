import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import type { FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";
import { FfmpegMuteAudioRepository } from "./FfmpegMuteAudioRepository";

const IMPLEMENTATION_ID = Symbol("ffmpeg-mute-audio");

export class FfmpegMuteAudioImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "ffmpeg";
  readonly repositories;

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    this.repositories = [new FfmpegMuteAudioRepository(config)];
  }

  assess(entity: MediaEditEntity, _context: MediaRoutingContext): RouteAssessment {
    return entity.command.operation === "mute"
      ? { supported: true, score: 10, reasons: ["portable-fallback"] }
      : { supported: false, score: 0, reasons: ["mute-required"] };
  }
}
