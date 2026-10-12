import type {
  EditVideoAspectRatioEntity,
  MediaRoutingContext,
  RoutableImplementation,
  RouteAssessment,
  VideoContainerFormat,
} from "../../../domain";
import { MediabunnyVideoAspectRatioRepository } from "./MediabunnyVideoAspectRatioRepository";

const IMPLEMENTATION_ID = Symbol("mediabunny-video-aspect-ratio");

export class MediabunnyVideoAspectRatioImplementation
  implements RoutableImplementation<EditVideoAspectRatioEntity>
{
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyVideoAspectRatioRepository()];

  assess(entity: EditVideoAspectRatioEntity, context: MediaRoutingContext): RouteAssessment {
    if (resolveOutputFormat(entity) !== "webm") {
      return { supported: false, score: 0, reasons: ["webm-output-required"] };
    }
    if (
      typeof VideoDecoder === "undefined" ||
      typeof VideoEncoder === "undefined" ||
      context.browser?.webCodecs.isVideoEncoderSupported !== true
    ) {
      return { supported: false, score: 0, reasons: ["browser-video-processing-unavailable"] };
    }
    return { supported: true, score: 160, reasons: ["native-webm-frame-processing"] };
  }
}

function resolveOutputFormat(entity: EditVideoAspectRatioEntity): VideoContainerFormat {
  if (entity.command.output?.format) return entity.command.output.format;
  const source = entity.command.source;
  const name =
    entity.command.fileName ?? (source.type === "file" ? source.file.name : source.type === "url" ? source.url : "");
  return name.toLowerCase().split(/[?#]/, 1)[0].endsWith(".webm") || (source.type === "blob" && source.blob.type === "video/webm")
    ? "webm"
    : "mp4";
}
