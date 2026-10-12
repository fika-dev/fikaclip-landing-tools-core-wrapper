import type {
  ConvertVideoFormatEntity,
  MediaRoutingContext,
  RoutableImplementation,
  RouteAssessment,
} from "../../../domain";
import { MediabunnyVideoFormatTranscodeRepository } from "./MediabunnyVideoFormatTranscodeRepository";
import { WEBM_VIDEO_HARDWARE_ACCELERATION } from "./WebMVideoEncodingOptions";

const IMPLEMENTATION_ID = Symbol("mediabunny-video-format");

export class MediabunnyVideoFormatImplementation implements RoutableImplementation<ConvertVideoFormatEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyVideoFormatTranscodeRepository()];

  async assess(entity: ConvertVideoFormatEntity, context: MediaRoutingContext): Promise<RouteAssessment> {
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
    if (needsVideoEncoder && !(await supportsVideoEncoding(entity))) {
      return { supported: false, score: 0, reasons: ["requested-video-codec-encoding-unavailable"] };
    }
    if (needsAudioEncoder && !(await supportsAudioEncoding())) {
      return { supported: false, score: 0, reasons: ["requested-audio-codec-encoding-unavailable"] };
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

async function supportsVideoEncoding(entity: ConvertVideoFormatEntity) {
  const codec = entity.plan?.output.videoCodec;
  if (codec !== "vp8" && codec !== "vp9") return false;
  const size = entity.inputMetadata?.size ?? entity.plan?.inputMetadata?.size;

  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: codec === "vp9" ? "vp09.00.10.08" : "vp8",
      width: Math.max(2, size?.width ?? 640),
      height: Math.max(2, size?.height ?? 360),
      bitrate: entity.plan?.output.bitrate ?? 2_000_000,
      framerate: entity.inputMetadata?.frameRate ?? entity.plan?.inputMetadata?.frameRate ?? 30,
      hardwareAcceleration: WEBM_VIDEO_HARDWARE_ACCELERATION,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

async function supportsAudioEncoding() {
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: "opus",
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}
