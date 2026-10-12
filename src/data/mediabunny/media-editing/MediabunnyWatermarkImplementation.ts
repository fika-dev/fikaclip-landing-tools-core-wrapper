import type {
  MediaEditEntity,
  MediaRoutingContext,
  RoutableImplementation,
  RouteAssessment,
  VideoContainerFormat,
} from "../../../domain";
import { MediabunnyWatermarkVideoRepository } from "./MediabunnyWatermarkVideoRepository";

const IMPLEMENTATION_ID = Symbol("mediabunny-watermark");

export class MediabunnyWatermarkImplementation implements RoutableImplementation<MediaEditEntity> {
  readonly id = IMPLEMENTATION_ID;
  readonly name = "mediabunny";
  readonly repositories = [new MediabunnyWatermarkVideoRepository()];

  assess(entity: MediaEditEntity, context: MediaRoutingContext): RouteAssessment {
    const command = entity.command;
    if (command.operation !== "watermark") return { supported: false, score: 0, reasons: ["watermark-required"] };
    if (resolveOutputFormat(command.fileName, command.source, command.output?.format) !== "webm") {
      return { supported: false, score: 0, reasons: ["webm-output-required"] };
    }
    if (
      typeof VideoDecoder === "undefined" ||
      typeof VideoEncoder === "undefined" ||
      typeof createImageBitmap === "undefined" ||
      (typeof OffscreenCanvas === "undefined" && typeof document === "undefined") ||
      context.browser?.webCodecs.isVideoEncoderSupported !== true
    ) {
      return { supported: false, score: 0, reasons: ["browser-video-processing-unavailable"] };
    }
    return { supported: true, score: 160, reasons: ["native-webm-frame-processing"] };
  }
}

function resolveOutputFormat(
  fileName: string | undefined,
  source: Extract<MediaEditEntity["command"], { operation: "watermark" }>["source"],
  requested: VideoContainerFormat | undefined,
) {
  if (requested) return requested;
  const name = fileName ?? (source.type === "file" ? source.file.name : source.type === "url" ? source.url : "");
  return name.toLowerCase().split(/[?#]/, 1)[0].endsWith(".webm") || (source.type === "blob" && source.blob.type === "video/webm")
    ? "webm"
    : "mp4";
}
