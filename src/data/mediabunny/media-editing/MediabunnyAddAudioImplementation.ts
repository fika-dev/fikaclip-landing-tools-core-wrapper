import type {
  MediaEditEntity,
  MediaRoutingContext,
  RoutableImplementation,
  RouteAssessment,
} from "../../../domain";
import { MediabunnyAddAudioRepository } from "./MediabunnyAddAudioRepository";

const IMPLEMENTATION_ID = Symbol("mediabunny-add-audio");

export class MediabunnyAddAudioImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyAddAudioRepository()];

  async assess(entity: MediaEditEntity, context: MediaRoutingContext): Promise<RouteAssessment> {
    const command = entity.command;
    if (command.operation !== "add-audio") {
      return { supported: false, score: 0, reasons: ["add-audio-required"] };
    }
    if (!isWebM(command.fileName, command.source) || (command.output?.format && command.output.format !== "webm")) {
      return { supported: false, score: 0, reasons: ["webm-input-and-output-required"] };
    }
    if (
      typeof OfflineAudioContext === "undefined" ||
      typeof AudioDecoder === "undefined" ||
      context.browser?.webCodecs.isAudioEncoderSupported !== true ||
      typeof AudioEncoder === "undefined"
    ) {
      return { supported: false, score: 0, reasons: ["browser-audio-processing-unavailable"] };
    }

    return {
      supported: true,
      score: context.browser?.deviceMemoryGb !== undefined && context.browser.deviceMemoryGb <= 4 ? 180 : 160,
      reasons: ["native-webm-remux", "audio-only-encoding"],
    };
  }
}

function isWebM(fileName: string | undefined, source: Extract<MediaEditEntity["command"], { operation: "add-audio" }>["source"]) {
  if (fileName?.toLowerCase().endsWith(".webm")) return true;
  if (source.type === "file") return source.file.type === "video/webm" || source.file.name.toLowerCase().endsWith(".webm");
  if (source.type === "blob") return source.blob.type === "video/webm";
  return source.url.toLowerCase().split(/[?#]/, 1)[0].endsWith(".webm");
}
