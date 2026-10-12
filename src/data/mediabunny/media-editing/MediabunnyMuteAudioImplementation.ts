import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import { isWebMEdit } from "./MediabunnyAudioEditConversion";
import { MediabunnyMuteAudioRepository } from "./MediabunnyMuteAudioRepository";

const IMPLEMENTATION_ID = Symbol("mediabunny-mute-audio");

export class MediabunnyMuteAudioImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyMuteAudioRepository()];

  assess(entity: MediaEditEntity, context: MediaRoutingContext): RouteAssessment {
    if (entity.command.operation !== "mute") return { supported: false, score: 0, reasons: ["mute-required"] };
    if (!isWebMEdit(entity)) return { supported: false, score: 0, reasons: ["webm-output-required"] };
    const needsAudioEncoder = entity.command.muteAll !== true;
    if (needsAudioEncoder && (typeof AudioDecoder === "undefined" || typeof AudioEncoder === "undefined" || context.browser?.webCodecs.isAudioEncoderSupported !== true)) {
      return { supported: false, score: 0, reasons: ["browser-audio-processing-unavailable"] };
    }
    return { supported: true, score: 170, reasons: [entity.command.muteAll ? "native-audio-track-removal" : "native-audio-sample-processing"] };
  }
}
