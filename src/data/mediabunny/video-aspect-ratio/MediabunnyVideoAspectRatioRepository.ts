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
  type EditVideoAspectRatioEntity,
  MediaEngineUnsupportedError,
  type MediaSource,
  type VideoAspectRatioRepository,
} from "../../../domain";

export class MediabunnyVideoAspectRatioRepository implements VideoAspectRatioRepository {
  readonly id = "mediabunny-video-aspect-ratio";

  async execute(entity: EditVideoAspectRatioEntity): Promise<EditVideoAspectRatioEntity> {
    const { command, jobId } = entity;
    const input = new Input({ source: createSource(command.source), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new MediaEngineUnsupportedError("mediabunny", "The input does not contain video.");

    const dimensions = resolveDimensions(
      await videoTrack.getDisplayWidth(),
      await videoTrack.getDisplayHeight(),
      command.aspectRatio,
    );
    const target = new BufferTarget();
    const format = new WebMOutputFormat();
    const output = new Output({ format, target });
    let conversion: Conversion | undefined;
    const abort = () => void conversion?.cancel();

    try {
      conversion = await Conversion.init({
        input,
        output,
        tracks: "primary",
        video: {
          codec: "vp9",
          width: dimensions.width,
          height: dimensions.height,
          fit: "contain",
          alpha: "discard",
          hardwareAcceleration: "prefer-software",
        },
        audio: { codec: "opus" },
        copy: { mode: "preferred" },
        showWarnings: false,
      });
      if (!conversion.isValid) {
        throw new MediaEngineUnsupportedError("mediabunny", "Mediabunny cannot process this WebM ratio request.");
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
          blob,
          fileName: `${baseName(command.fileName)}.ratio.webm`,
          mimeType: blob.type,
          sizeBytes: blob.size,
          details: {
            aspectRatio: command.aspectRatio,
            output: { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
            warnings: ["원본 비율을 유지하고 목표 프레임을 검은 여백으로 채워 저장했습니다."],
          },
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
}

function createSource(source: MediaSource) {
  if (source.type === "file") return new BlobSource(source.file);
  if (source.type === "blob") return new BlobSource(source.blob);
  return new UrlSource(source.url);
}

function resolveDimensions(width: number, height: number, aspectRatio: EditVideoAspectRatioEntity["command"]["aspectRatio"]) {
  const targetRatio = { "9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1, "4:3": 4 / 3 }[aspectRatio];
  if (width / height > targetRatio) return { width: even(width), height: even(width / targetRatio) };
  return { width: even(height * targetRatio), height: even(height) };
}

function even(value: number) {
  return Math.max(2, Math.ceil(value / 2) * 2);
}

function baseName(fileName?: string) {
  return (fileName ?? "video").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
