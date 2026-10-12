import type {
  ConvertVideoFormatEntity,
  MediaRoutingContext,
  RoutableImplementation,
  RouteAssessment,
} from "../../../domain";
import type { FfmpegVideoFormatTranscodeRepositoryConfig } from "./FfmpegVideoFormatTranscodeRepository";
import { FfmpegVideoFormatTranscodeRepository } from "./FfmpegVideoFormatTranscodeRepository";

const IMPLEMENTATION_ID = Symbol("ffmpeg-video-format");

export class FfmpegVideoFormatImplementation implements RoutableImplementation<ConvertVideoFormatEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "ffmpeg";
  readonly repositories: readonly FfmpegVideoFormatTranscodeRepository[];

  constructor(config: FfmpegVideoFormatTranscodeRepositoryConfig) {
    this.repositories = [new FfmpegVideoFormatTranscodeRepository(config)];
  }

  assess(entity: ConvertVideoFormatEntity, context: MediaRoutingContext): RouteAssessment {
    const plan = entity.plan;
    if (!plan) return { supported: false, score: 0, reasons: ["conversion-plan-required"] };
    if (plan.output.format === "webm") {
      return { supported: false, score: 0, reasons: ["webm-is-not-exposed-by-this-implementation"] };
    }

    let score = plan.mode === "remux" ? 120 : 90;
    const reasons = [plan.mode === "remux" ? "stream-copy" : "broad-codec-support"];

    const browser = context.browser;
    if (browser?.deviceMemoryGb !== undefined && browser.deviceMemoryGb <= 4) {
      score -= 20;
      reasons.push("memory-constrained-device");
    }
    if (browser?.isMobile || browser?.isLikelyInAppBrowser) {
      score -= 10;
      reasons.push("constrained-browser-runtime");
    }

    return { supported: true, score, reasons };
  }
}
