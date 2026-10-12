import type { MediaEditEntity, MediaRoutingContext, RoutableImplementation, RouteAssessment } from "../../../domain";
import { MediabunnyExtractAudioRepository } from "./MediabunnyExtractAudioRepository";

const IMPLEMENTATION_ID = Symbol("mediabunny-extract-audio");

export class MediabunnyExtractAudioImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyExtractAudioRepository()];

  assess(entity: MediaEditEntity, context: MediaRoutingContext): RouteAssessment {
    const command = entity.command;
    if (command.operation !== "extract-audio") return { supported: false, score: 0, reasons: ["extract-audio-required"] };
    if (!isWebM(command.fileName, command.source)) return { supported: false, score: 0, reasons: ["webm-input-required"] };
    if (command.format === "mp3") return { supported: false, score: 0, reasons: ["mp3-encoder-extension-required"] };
    const needsEncoder = command.format !== "wav";
    if (needsEncoder && (typeof AudioDecoder === "undefined" || typeof AudioEncoder === "undefined" || context.browser?.webCodecs.isAudioEncoderSupported !== true)) {
      return { supported: false, score: 0, reasons: ["browser-audio-processing-unavailable"] };
    }
    return { supported: true, score: 170, reasons: ["native-webm-audio-extraction"] };
  }
}

function isWebM(fileName: string | undefined, source: Extract<MediaEditEntity["command"], { operation: "extract-audio" }>["source"]) {
  if (fileName?.toLowerCase().endsWith(".webm")) return true;
  if (source.type === "file") return source.file.type === "video/webm" || source.file.name.toLowerCase().endsWith(".webm");
  if (source.type === "blob") return source.blob.type === "video/webm";
  return source.url.toLowerCase().split(/[?#]/, 1)[0].endsWith(".webm");
}
