import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  type ConversionAudioOptions,
  Input,
  Output,
  UrlSource,
  WebMOutputFormat,
} from "mediabunny";

import {
  createMediaProgressReporter,
  type MediaEditEntity,
  MediaEngineUnsupportedError,
  type MediaSource,
} from "../../../domain";

export async function executeWebMAudioEdit(
  entity: MediaEditEntity,
  audio: ConversionAudioOptions,
): Promise<MediaEditEntity> {
  const { command, jobId } = entity;
  if (command.operation === "extract-audio") throw new Error("A video edit command is required.");

  const input = new Input({ source: createSource(command.source), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const format = new WebMOutputFormat();
  const output = new Output({ format, target });
  let conversion: Conversion | undefined;
  const abort = () => void conversion?.cancel();
  const progress = createMediaProgressReporter(command.job, jobId, [
    { phase: "loading", weight: 0.05 },
    { phase: "probing", weight: 0.05 },
    { phase: "transcoding", weight: 0.85 },
    { phase: "writing", weight: 0.05 },
  ]);

  try {
    progress.report("loading", 0);
    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: undefined,
      audio,
      copy: { mode: "preferred" },
      showWarnings: false,
    });
    progress.report("loading", 1);
    progress.report("probing", 1);
    if (!conversion.isValid) {
      throw new MediaEngineUnsupportedError("mediabunny", `Mediabunny cannot process WebM ${command.operation}.`);
    }

    conversion.onProgress = (ratio) => progress.report("transcoding", ratio);
    command.job?.signal?.addEventListener("abort", abort, { once: true });
    await conversion.execute();
    progress.report("transcoding", 1);
    progress.report("writing", 0);
    if (!target.buffer) throw new Error("Mediabunny completed without output data.");

    const blob = new Blob([target.buffer], { type: format.mimeType });
    progress.report("writing", 1);
    progress.done();
    return {
      ...entity,
      result: {
        operation: command.operation,
        blob,
        fileName: `${baseName(command.fileName)}.${command.operation}.webm`,
        mimeType: blob.type,
        sizeBytes: blob.size,
        warnings: [],
      },
    };
  } catch (error) {
    if (error instanceof ConversionCanceledError || command.job?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    throw error;
  } finally {
    command.job?.signal?.removeEventListener("abort", abort);
    input.dispose();
  }
}

export function isWebMEdit(entity: MediaEditEntity) {
  const command = entity.command;
  if (command.operation === "extract-audio") return false;
  if (command.output?.format) return command.output.format === "webm";
  const source = command.source;
  const name = command.fileName ?? (source.type === "file" ? source.file.name : source.type === "url" ? source.url : "");
  return name.toLowerCase().split(/[?#]/, 1)[0].endsWith(".webm") || (source.type === "blob" && source.blob.type === "video/webm");
}

function createSource(source: MediaSource) {
  if (source.type === "file") return new BlobSource(source.file);
  if (source.type === "blob") return new BlobSource(source.blob);
  return new UrlSource(source.url);
}

function baseName(fileName?: string) {
  return (fileName ?? "video").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}
