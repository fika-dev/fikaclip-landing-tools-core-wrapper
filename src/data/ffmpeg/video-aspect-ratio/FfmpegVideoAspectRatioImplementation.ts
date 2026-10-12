import type {
  EditVideoAspectRatioEntity,
  MediaRoutingContext,
  RoutableImplementation,
  RouteAssessment,
} from "../../../domain";
import {
  FfmpegVideoAspectRatioRepository,
  type FfmpegVideoAspectRatioRepositoryConfig,
} from "./FfmpegVideoAspectRatioRepository";

const IMPLEMENTATION_ID = Symbol("ffmpeg-video-aspect-ratio");

export class FfmpegVideoAspectRatioImplementation
  implements RoutableImplementation<EditVideoAspectRatioEntity>
{
  readonly id = IMPLEMENTATION_ID;
  readonly name = "ffmpeg";
  readonly repositories;

  constructor(config: FfmpegVideoAspectRatioRepositoryConfig) {
    this.repositories = [new FfmpegVideoAspectRatioRepository(config)];
  }

  assess(_entity: EditVideoAspectRatioEntity, _context: MediaRoutingContext): RouteAssessment {
    return { supported: true, score: 10, reasons: ["portable-fallback"] };
  }
}
