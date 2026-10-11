import type {
  ConvertVideoFormatEntity,
  MediaRoutingContext,
  RoutableImplementation,
  RouteAssessment,
} from "../../../domain";
import { MediabunnyVideoFormatTranscodeRepository } from "./MediabunnyVideoFormatTranscodeRepository";

const IMPLEMENTATION_ID = Symbol("mediabunny-video-format");

export class MediabunnyVideoFormatImplementation implements RoutableImplementation<ConvertVideoFormatEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyVideoFormatTranscodeRepository()];

  assess(entity: ConvertVideoFormatEntity, context: MediaRoutingContext): RouteAssessment {
    const plan = entity.plan;
    if (!plan || plan.output.format !== "webm") {
      return { supported: false, score: 0, reasons: ["webm-output-required"] };
    }

    const needsVideoEncoder = plan.output.videoCodec !== "copy";
    const needsAudioEncoder = plan.output.audioCodec !== "copy" && plan.output.audioCodec !== "none";
    const browser = context.browser;
    const supportsVideo = !needsVideoEncoder || browser?.webCodecs.isVideoEncoderSupported === true;
    const supportsAudio = !needsAudioEncoder || browser?.webCodecs.isAudioEncoderSupported === true;

    if (!supportsVideo || !supportsAudio) {
      return { supported: false, score: 0, reasons: ["required-webcodecs-encoder-unavailable"] };
    }

    let score = plan.mode === "remux" ? 140 : 130;
    const reasons = [plan.mode === "remux" ? "native-remux" : "native-webm-encoding"];
    if (browser?.deviceMemoryGb !== undefined && browser.deviceMemoryGb <= 4) {
      score += 20;
      reasons.push("memory-constrained-device");
    }
    if (browser?.isMobile) {
      score += 10;
      reasons.push("mobile-device");
    }

    return { supported: true, score, reasons };
  }
}
