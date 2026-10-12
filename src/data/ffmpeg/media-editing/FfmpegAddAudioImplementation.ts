import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import { FfmpegAddAudioRepository } from "./FfmpegAddAudioRepository";
import type { FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

const IMPLEMENTATION_ID = Symbol("ffmpeg-add-audio");

export class FfmpegAddAudioImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "ffmpeg";
  readonly repositories;

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    this.repositories = [new FfmpegAddAudioRepository(config)];
  }

  async assess(entity: MediaEditEntity, _context: MediaRoutingContext): Promise<RouteAssessment> {
    return entity.command.operation === "add-audio"
      ? { supported: true, score: 10, reasons: ["portable-fallback"] }
      : { supported: false, score: 0, reasons: ["add-audio-required"] };
  }
}
