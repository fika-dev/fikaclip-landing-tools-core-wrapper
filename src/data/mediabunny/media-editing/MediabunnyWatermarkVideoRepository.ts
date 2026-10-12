import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Output,
  UrlSource,
  WebMOutputFormat,
} from "mediabunny";

import {
  type MediaEditEntity,
  MediaEngineUnsupportedError,
  type MediaSource,
  type WatermarkVideoRepository,
} from "../../../domain";

export class MediabunnyWatermarkVideoRepository implements WatermarkVideoRepository {
  readonly id = "mediabunny-watermark-video";

  async execute(entity: MediaEditEntity): Promise<MediaEditEntity> {
    const { command, jobId } = entity;
    if (command.operation !== "watermark") throw new Error("Watermark repository received an invalid command.");

    const input = new Input({ source: createSource(command.source), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const format = new WebMOutputFormat();
    const output = new Output({ format, target });
    const watermark = await loadImage(command.layer.image);
    let conversion: Conversion | undefined;
    const abort = () => void conversion?.cancel();

    try {
      conversion = await Conversion.init({
        input,
        output,
        tracks: "primary",
        video: {
          codec: "vp9",
          hardwareAcceleration: "prefer-software",
          process: (sample) => {
            const canvas = createCanvas(sample.displayWidth, sample.displayHeight);
            const context = canvas.getContext("2d");
            if (!context) throw new MediaEngineUnsupportedError("mediabunny", "A 2D canvas is required.");
            sample.draw(context, 0, 0, sample.displayWidth, sample.displayHeight);

            const size = resolveWatermarkSize(
              watermark.width,
              watermark.height,
              command.layer.width,
              command.layer.height,
            );
            context.globalAlpha = clamp(command.layer.opacity ?? 1);
            context.drawImage(watermark, Math.max(0, command.layer.x), Math.max(0, command.layer.y), size.width, size.height);
            context.globalAlpha = 1;
            return canvas;
          },
        },
        audio: { codec: "opus" },
        copy: { mode: "preferred" },
        showWarnings: false,
      });
      if (!conversion.isValid) {
        throw new MediaEngineUnsupportedError("mediabunny", "Mediabunny cannot process this WebM watermark request.");
      }

      conversion.onProgress = (ratio) =>
        command.job?.onProgress?.({ jobId, phase: "transcoding", ratio: clamp(ratio) });
      command.job?.signal?.addEventListener("abort", abort, { once: true });
      await conversion.execute();
      if (!target.buffer) throw new Error("Mediabunny completed without output data.");

      const blob = new Blob([target.buffer], { type: format.mimeType });
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });
      return {
        ...entity,
        result: {
          operation: "watermark",
          blob,
          fileName: `${baseName(command.fileName)}.watermark.webm`,
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
      watermark.close();
      input.dispose();
    }
  }
}

function createSource(source: MediaSource) {
  if (source.type === "file") return new BlobSource(source.file);
  if (source.type === "blob") return new BlobSource(source.blob);
  return new UrlSource(source.url);
}

async function loadImage(source: MediaSource) {
  const blob =
    source.type === "file"
      ? source.file
      : source.type === "blob"
        ? source.blob
        : await fetch(source.url, { credentials: source.crossOrigin === "use-credentials" ? "include" : "same-origin" }).then(
            (response) => response.blob(),
          );
  return createImageBitmap(blob);
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function resolveWatermarkSize(sourceWidth: number, sourceHeight: number, width?: number, height?: number) {
  if (width && height) return { width, height };
  if (width) return { width, height: (width * sourceHeight) / sourceWidth };
  if (height) return { width: (height * sourceWidth) / sourceHeight, height };
  return { width: sourceWidth, height: sourceHeight };
}

function baseName(fileName?: string) {
  return (fileName ?? "video").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
