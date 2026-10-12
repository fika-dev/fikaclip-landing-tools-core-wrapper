import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import { MediabunnyAdjustAudioVolumeRepository } from "./MediabunnyAdjustAudioVolumeRepository";
import { isWebMEdit } from "./MediabunnyAudioEditConversion";

const IMPLEMENTATION_ID = Symbol("mediabunny-adjust-audio-volume");

export class MediabunnyAdjustAudioVolumeImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyAdjustAudioVolumeRepository()];

  assess(entity: MediaEditEntity, context: MediaRoutingContext): RouteAssessment {
    if (entity.command.operation !== "adjust-volume") return { supported: false, score: 0, reasons: ["adjust-volume-required"] };
    if (!isWebMEdit(entity)) return { supported: false, score: 0, reasons: ["webm-output-required"] };
    if (typeof AudioDecoder === "undefined" || typeof AudioEncoder === "undefined" || context.browser?.webCodecs.isAudioEncoderSupported !== true) {
      return { supported: false, score: 0, reasons: ["browser-audio-processing-unavailable"] };
    }
    return { supported: true, score: 170, reasons: ["native-audio-sample-processing"] };
  }
}
