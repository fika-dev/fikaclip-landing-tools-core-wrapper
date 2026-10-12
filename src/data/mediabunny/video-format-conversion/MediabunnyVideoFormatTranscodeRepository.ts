import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  type ConversionAudioOptions,
  ConversionCanceledError,
  type ConversionVideoOptions,
  Input,
  Output,
  UrlSource,
  WebMOutputFormat,
} from "mediabunny";

import { type ConvertVideoFormatEntity, MediaEngineUnsupportedError, type MediaSource } from "../../../domain";
import { WEBM_VIDEO_HARDWARE_ACCELERATION } from "./WebMVideoEncodingOptions";

export class MediabunnyVideoFormatTranscodeRepository {
  readonly id = "mediabunny-video-format-transcode";

  async execute(entity: ConvertVideoFormatEntity): Promise<ConvertVideoFormatEntity> {
    const { command, jobId, plan } = entity;

    if (!plan) {
      throw new Error("Mediabunny transcode repository requires a conversion plan.");
    }

    if (plan.output.format !== "webm") {
      throw new MediaEngineUnsupportedError("mediabunny", "Mediabunny routing currently supports WebM output only.");
    }

    command.job?.onProgress?.({
      jobId,
      phase: plan.mode === "remux" ? "remuxing" : "transcoding",
      ratio: 0,
    });

    const input = new Input({ source: createSource(command.source), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    let conversion: Conversion | undefined;
    const abort = () => void conversion?.cancel();

    try {
      conversion = await Conversion.init({
        input,
        output,
        tracks: "primary",
        video: createVideoOptions(plan.output.videoCodec, plan.output.bitrate),
        audio: createAudioOptions(plan.output.audioCodec),
        copy: plan.mode === "remux" ? { mode: "forced" } : { mode: "preferred" },
        showWarnings: false,
      });

      if (!conversion.isValid) {
        throw new MediaEngineUnsupportedError(
          "mediabunny",
          `Mediabunny cannot convert the requested tracks: ${conversion.discardedTracks
            .map(({ reason }) => reason)
            .join(", ")}`,
        );
      }

      conversion.onProgress = (ratio) => {
        command.job?.onProgress?.({ jobId, phase: "transcoding", ratio: clampProgress(ratio) });
      };
      command.job?.signal?.addEventListener("abort", abort, { once: true });
      await conversion.execute();

      if (!target.buffer) {
        throw new Error("Mediabunny conversion completed without output data.");
      }

      const blob = new Blob([target.buffer], { type: "video/webm" });
      const fileName = createOutputFileName(command.fileName);
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });

      return {
        ...entity,
        result: {
          blob,
          fileName,
          mimeType: blob.type,
          sizeBytes: blob.size,
          details: { ...plan, engine: "mediabunny" },
        },
      };
    } catch (error) {
      if (error instanceof ConversionCanceledError || command.job?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      if (!conversion && !(error instanceof MediaEngineUnsupportedError)) {
        throw new MediaEngineUnsupportedError(
          "mediabunny",
          `Mediabunny could not initialize this conversion: ${getErrorMessage(error)}`,
        );
      }

      throw error;
    } finally {
      command.job?.signal?.removeEventListener("abort", abort);
      input.dispose();
    }
  }
}

function createSource(source: MediaSource) {
  if (source.type === "file") return new BlobSource(source.file);
  if (source.type === "blob") return new BlobSource(source.blob);
  return new UrlSource(source.url);
}

function createVideoOptions(
  codec: NonNullable<ConvertVideoFormatEntity["plan"]>["output"]["videoCodec"],
  bitrate: number | undefined,
): ConversionVideoOptions | undefined {
  if (codec === "copy") return undefined;
  if (codec !== "vp8" && codec !== "vp9") {
    throw new MediaEngineUnsupportedError("mediabunny", `Mediabunny WebM output does not support ${codec} video.`);
  }

  return {
    codec,
    bitrate,
    forceTranscode: true,
    hardwareAcceleration: WEBM_VIDEO_HARDWARE_ACCELERATION,
  };
}

function createAudioOptions(
  codec: NonNullable<ConvertVideoFormatEntity["plan"]>["output"]["audioCodec"],
): ConversionAudioOptions | undefined {
  if (codec === "copy") return undefined;
  if (codec === "none") return { discard: true };
  if (codec !== "opus") {
    throw new MediaEngineUnsupportedError("mediabunny", `Mediabunny WebM output does not support ${codec} audio.`);
  }

  return { codec, forceTranscode: true };
}

function createOutputFileName(fileName: string | undefined) {
  const baseName = (fileName ?? "output").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[a-z0-9]+$/i, "");
  return `${baseName}.converted.webm`;
}

function clampProgress(progress: number) {
  return Math.max(0, Math.min(1, progress));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
