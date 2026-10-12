import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import { FfmpegExtractAudioRepository } from "./FfmpegExtractAudioRepository";
import type { FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";

const IMPLEMENTATION_ID = Symbol("ffmpeg-extract-audio");

export class FfmpegExtractAudioImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "ffmpeg";
  readonly repositories;

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    this.repositories = [new FfmpegExtractAudioRepository(config)];
  }

  assess(entity: MediaEditEntity, _context: MediaRoutingContext): RouteAssessment {
    return entity.command.operation === "extract-audio"
      ? { supported: true, score: 10, reasons: ["portable-fallback"] }
      : { supported: false, score: 0, reasons: ["extract-audio-required"] };
  }
}
