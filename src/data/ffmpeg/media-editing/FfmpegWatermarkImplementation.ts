import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import type { FfmpegMediaEditRepositoryConfig } from "./FfmpegMediaEditRepository";
import { FfmpegWatermarkVideoRepository } from "./FfmpegWatermarkVideoRepository";

const IMPLEMENTATION_ID = Symbol("ffmpeg-watermark");

export class FfmpegWatermarkImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "ffmpeg";
  readonly repositories;

  constructor(config: FfmpegMediaEditRepositoryConfig) {
    this.repositories = [new FfmpegWatermarkVideoRepository(config)];
  }

  assess(entity: MediaEditEntity, _context: MediaRoutingContext): RouteAssessment {
    return entity.command.operation === "watermark"
      ? { supported: true, score: 10, reasons: ["portable-fallback"] }
      : { supported: false, score: 0, reasons: ["watermark-required"] };
  }
}
