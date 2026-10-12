import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  type OutputFormat,
  UrlSource,
  WavOutputFormat,
} from "mediabunny";

import {
  createMediaProgressReporter,
  type ExtractAudioRepository,
  type MediaEditEntity,
  MediaEngineUnsupportedError,
  type MediaSource,
} from "../../../domain";

export class MediabunnyExtractAudioRepository implements ExtractAudioRepository {
  readonly id = "mediabunny-extract-audio";

  async execute(entity: MediaEditEntity): Promise<MediaEditEntity> {
    const { command, jobId } = entity;
    if (command.operation !== "extract-audio") throw new Error("Audio extraction repository received an invalid command.");
    if (command.format === "mp3") {
      throw new MediaEngineUnsupportedError("mediabunny", "Mediabunny core does not include an MP3 encoder.");
    }
    const audioFormat = command.format;

    const input = new Input({ source: createSource(command.source), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const outputFormat = createOutputFormat(audioFormat);
    const output = new Output({ format: outputFormat, target });
    const selectedTrack = command.audioTrackIndex ?? 0;
    let conversion: Conversion | undefined;
    const abort = () => void conversion?.cancel();
    const progress = createMediaProgressReporter(command.job, jobId, [
      { phase: "loading", weight: 0.05 },
      { phase: "decoding", weight: 0.9 },
      { phase: "writing", weight: 0.05 },
    ]);

    try {
      progress.report("loading", 0);
      conversion = await Conversion.init({
        input,
        output,
        tracks: "all",
        video: { discard: true },
        audio: (_track, index) =>
          index === selectedTrack + 1 ? { codec: codecFor(audioFormat), forceTranscode: true } : { discard: true },
        copy: { mode: "preferred" },
        showWarnings: false,
      });
      progress.report("loading", 1);
      if (!conversion.isValid) {
        throw new MediaEngineUnsupportedError("mediabunny", "Mediabunny cannot extract the selected WebM audio track.");
      }

      conversion.onProgress = (ratio) => progress.report("decoding", ratio);
      command.job?.signal?.addEventListener("abort", abort, { once: true });
      await conversion.execute();
      progress.report("decoding", 1);
      progress.report("writing", 0);
      if (!target.buffer) throw new Error("Mediabunny completed without output data.");

      const mimeType = mimeTypeFor(audioFormat);
      const blob = new Blob([target.buffer], { type: mimeType });
      progress.report("writing", 1);
      progress.done();
      return {
        ...entity,
        result: {
          operation: "extract-audio",
          blob,
          fileName: `${baseName(command.fileName)}.extract-audio.${audioFormat}`,
          mimeType,
          sizeBytes: blob.size,
          warnings: [],
        },
      };
    } catch (error) {
      if (error instanceof ConversionCanceledError || command.job?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      if (!conversion && !(error instanceof MediaEngineUnsupportedError)) {
        throw new MediaEngineUnsupportedError("mediabunny", `Mediabunny audio extraction is unavailable: ${messageOf(error)}`);
      }
      throw error;
    } finally {
      command.job?.signal?.removeEventListener("abort", abort);
      input.dispose();
    }
  }
}

function createOutputFormat(format: "m4a" | "wav" | "ogg"): OutputFormat {
  if (format === "m4a") return new Mp4OutputFormat();
  if (format === "ogg") return new OggOutputFormat();
  return new WavOutputFormat();
}

function codecFor(format: "m4a" | "wav" | "ogg") {
  return format === "m4a" ? "aac" as const : format === "ogg" ? "opus" as const : "pcm-s16" as const;
}

function mimeTypeFor(format: "m4a" | "wav" | "ogg") {
  return format === "m4a" ? "audio/mp4" : format === "ogg" ? "audio/ogg" : "audio/wav";
}

function createSource(source: MediaSource) {
  if (source.type === "file") return new BlobSource(source.file);
  if (source.type === "blob") return new BlobSource(source.blob);
  return new UrlSource(source.url);
}

function baseName(fileName?: string) {
  return (fileName ?? "video").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
