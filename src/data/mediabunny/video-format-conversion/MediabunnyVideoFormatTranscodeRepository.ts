import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  type ConversionAudioOptions,
  ConversionCanceledError,
  type ConversionVideoOptions,
  Input,
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  type OutputFormat,
  UrlSource,
  WebMOutputFormat,
} from "mediabunny";

import {
  type ConvertVideoFormatEntity,
  createMediaProgressReporter,
  MediaEngineUnsupportedError,
  type MediaSource,
  type VideoContainerFormat,
} from "../../../domain";
import { WEBM_VIDEO_HARDWARE_ACCELERATION } from "./WebMVideoEncodingOptions";

export class MediabunnyVideoFormatTranscodeRepository {
  readonly id = "mediabunny-video-format-transcode";

  async execute(entity: ConvertVideoFormatEntity): Promise<ConvertVideoFormatEntity> {
    const { command, jobId, plan } = entity;

    if (!plan) {
      throw new Error("Mediabunny transcode repository requires a conversion plan.");
    }
    const workPhase = plan.mode === "remux" ? "remuxing" : "transcoding";
    const progress = createMediaProgressReporter(command.job, jobId, [
      { phase: "loading", weight: 0.05 },
      { phase: workPhase, weight: 0.9 },
      { phase: "writing", weight: 0.05 },
    ]);
    progress.report("loading", 0);

    const input = new Input({ source: createSource(command.source), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const outputFormat = createOutputFormat(plan.output.format);
    const output = new Output({ format: outputFormat, target });
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
      progress.report("loading", 1);

      if (!conversion.isValid) {
        throw new MediaEngineUnsupportedError(
          "mediabunny",
          `Mediabunny cannot convert the requested tracks: ${conversion.discardedTracks
            .map(({ reason }) => reason)
            .join(", ")}`,
        );
      }

      conversion.onProgress = (ratio) => {
        progress.report(workPhase, ratio);
      };
      command.job?.signal?.addEventListener("abort", abort, { once: true });
      await conversion.execute();
      progress.report(workPhase, 1);
      progress.report("writing", 0);

      if (!target.buffer) {
        throw new Error("Mediabunny conversion completed without output data.");
      }

      const blob = new Blob([target.buffer], { type: outputFormat.mimeType });
      const fileName = createOutputFileName(command.fileName, plan.output.format);
      progress.report("writing", 1);
      progress.done();

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
  const outputCodec = codec === "h264" ? "avc" : codec === "h265" ? "hevc" : codec;
  if (outputCodec !== "avc" && outputCodec !== "hevc" && outputCodec !== "vp8" && outputCodec !== "vp9") {
    throw new MediaEngineUnsupportedError("mediabunny", `Mediabunny does not support ${codec} video.`);
  }

  return {
    codec: outputCodec,
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
  if (codec !== "opus" && codec !== "aac" && codec !== "mp3") {
    throw new MediaEngineUnsupportedError("mediabunny", `Mediabunny does not support ${codec} audio.`);
  }

  return { codec, forceTranscode: true };
}

function createOutputFormat(format: VideoContainerFormat): OutputFormat {
  if (format === "mp4") return new Mp4OutputFormat();
  if (format === "mov") return new MovOutputFormat();
  if (format === "mkv") return new MkvOutputFormat();
  return new WebMOutputFormat();
}

function createOutputFileName(fileName: string | undefined, format: VideoContainerFormat) {
  const baseName = (fileName ?? "output").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[a-z0-9]+$/i, "");
  return `${baseName}.converted.${format}`;
}


function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
