import {
  normalizeAudioCodec,
  normalizeContainerFormat,
  normalizeVideoCodec,
  type InspectMediaEntity,
  type MediaMetadata,
  type MediaProbeRepository,
  type MediaSource,
} from "../../domain";

export class BrowserMediaProbeRepository implements MediaProbeRepository {
  readonly id = "browser-media-probe";

  async execute(entity: InspectMediaEntity): Promise<InspectMediaEntity> {
    if (typeof window === "undefined") {
      throw new Error("Media inspection is only available in the browser.");
    }

    const { command, jobId } = entity;

    command.job?.onProgress?.({ jobId, phase: "loading", ratio: 0 });
    const result = await inspectMediaSource(command.source, command.fileName, command.job?.signal, (ratio) => {
      command.job?.onProgress?.({
        jobId,
        phase: ratio < 0.45 ? "loading" : "probing",
        ratio,
      });
    });
    command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });

    return { ...entity, result };
  }
}

async function inspectMediaSource(
  source: MediaSource,
  fileName: string | undefined,
  signal?: AbortSignal,
  onProgress?: (ratio: number) => void,
) {
  throwIfAborted(signal);
  const fileInfo = getMediaSourceFileInfo(source, fileName);
  onProgress?.(0.15);

  const probeText = await readMediaSourceProbeText(source, signal);
  onProgress?.(0.45);

  const browserMetadata = await inspectBrowserVideoMetadata(source, signal);
  onProgress?.(0.85);

  const rawFormat = inferRawFormat(fileInfo, probeText);
  const { rawVideoCodec, rawAudioCodec } = inferRawCodecs(probeText);
  const metadata: MediaMetadata = {
    ...browserMetadata,
    container: rawFormat,
    mimeType: fileInfo.mimeType,
    video: rawVideoCodec ? { codec: rawVideoCodec } : undefined,
    audio: rawAudioCodec ? { codec: rawAudioCodec } : undefined,
  };

  return {
    ...fileInfo,
    metadata,
    format: normalizeContainerFormat(rawFormat),
    videoCodec: normalizeVideoCodec(rawVideoCodec),
    audioCodec: normalizeAudioCodec(rawAudioCodec),
    rawFormat,
    rawVideoCodec,
    rawAudioCodec,
  };
}

async function inspectBrowserVideoMetadata(source: MediaSource, signal?: AbortSignal): Promise<MediaMetadata> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl =
      source.type === "url" ? undefined : URL.createObjectURL(source.type === "file" ? source.file : source.blob);
    const src = objectUrl ?? (source.type === "url" ? source.url : "");
    let settled = false;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      signal?.removeEventListener("abort", handleAbort);
      window.clearTimeout(timeoutId);
    };

    const finish = (metadata: MediaMetadata) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(metadata);
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(createAbortError(signal));
    };

    const readMetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : undefined;
      const size =
        video.videoWidth > 0 && video.videoHeight > 0
          ? { width: video.videoWidth, height: video.videoHeight }
          : undefined;

      if (durationSeconds !== undefined || size) {
        finish({ durationSeconds, size });
      }
    };

    const timeoutId = window.setTimeout(() => readMetadata(), 7000);

    signal?.addEventListener("abort", handleAbort, { once: true });
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    if (source.type === "url" && source.crossOrigin) {
      video.crossOrigin = source.crossOrigin;
    }

    video.onloadedmetadata = readMetadata;
    video.onloadeddata = readMetadata;
    video.oncanplay = readMetadata;
    video.onerror = () => finish({});
    video.src = src;
  });
}

async function readMediaSourceProbeText(source: MediaSource, signal?: AbortSignal) {
  throwIfAborted(signal);

  if (source.type === "file" || source.type === "blob") {
    return readBlobProbeText(source.type === "file" ? source.file : source.blob, signal);
  }

  return readUrlProbeText(source, signal);
}

async function readBlobProbeText(blob: Blob, signal?: AbortSignal) {
  const chunkSize = 2 * 1024 * 1024;
  const decoder = new TextDecoder("iso-8859-1");
  const head = await blob.slice(0, chunkSize).arrayBuffer();
  throwIfAborted(signal);

  if (blob.size <= chunkSize * 2) {
    return decoder.decode(head);
  }

  const tail = await blob.slice(Math.max(0, blob.size - chunkSize)).arrayBuffer();
  throwIfAborted(signal);
  return `${decoder.decode(head)}\0${decoder.decode(tail)}`;
}

async function readUrlProbeText(source: Extract<MediaSource, { type: "url" }>, signal?: AbortSignal) {
  try {
    const response = await fetch(source.url, {
      credentials: source.crossOrigin === "use-credentials" ? "include" : "same-origin",
      headers: { Range: "bytes=0-2097151" },
      signal,
    });

    if (!response.ok) {
      return "";
    }

    const buffer = await response.arrayBuffer();
    throwIfAborted(signal);
    return new TextDecoder("iso-8859-1").decode(buffer);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return "";
  }
}

function inferRawFormat(
  fileInfo: ReturnType<typeof getMediaSourceFileInfo>,
  probeText: string | undefined,
): string | undefined {
  const extensionFormat = normalizeContainerFormat(getFileExtension(fileInfo.fileName));
  if (extensionFormat) return extensionFormat;

  const mimeFormat = normalizeContainerFormat(fileInfo.mimeType);
  if (mimeFormat) return mimeFormat;

  const lowerProbeText = probeText?.toLowerCase() ?? "";
  if (lowerProbeText.includes("ftypqt")) return "mov";
  if (lowerProbeText.includes("ftyp")) return "mp4";
  if (lowerProbeText.includes("webm")) return "webm";
  if (lowerProbeText.includes("matroska")) return "matroska";

  return undefined;
}

function inferRawCodecs(probeText: string | undefined) {
  const lowerProbeText = probeText?.toLowerCase() ?? "";
  let rawVideoCodec: string | undefined;
  let rawAudioCodec: string | undefined;

  if (lowerProbeText.includes("avc1") || lowerProbeText.includes("avc3") || lowerProbeText.includes("h264")) {
    rawVideoCodec = "h264";
  } else if (
    lowerProbeText.includes("hvc1") ||
    lowerProbeText.includes("hev1") ||
    lowerProbeText.includes("hevc") ||
    lowerProbeText.includes("h265")
  ) {
    rawVideoCodec = "hevc";
  } else if (lowerProbeText.includes("av01") || lowerProbeText.includes("v_av1")) {
    rawVideoCodec = "av1";
  } else if (lowerProbeText.includes("vp09") || lowerProbeText.includes("v_vp9")) {
    rawVideoCodec = "vp9";
  } else if (lowerProbeText.includes("vp08") || lowerProbeText.includes("v_vp8")) {
    rawVideoCodec = "vp8";
  }

  if (lowerProbeText.includes("a_opus") || lowerProbeText.includes("opus")) {
    rawAudioCodec = "opus";
  } else if (lowerProbeText.includes("a_aac") || lowerProbeText.includes("mp4a") || lowerProbeText.includes("aac")) {
    rawAudioCodec = "aac";
  } else if (
    lowerProbeText.includes("a_mpeg/l3") ||
    lowerProbeText.includes(".mp3") ||
    lowerProbeText.includes("mp3")
  ) {
    rawAudioCodec = "mp3";
  }

  return { rawVideoCodec, rawAudioCodec };
}

function getMediaSourceFileInfo(source: MediaSource, fileName: string | undefined) {
  if (source.type === "file") {
    return {
      fileName: fileName ?? source.file.name,
      sizeBytes: source.file.size,
      mimeType: source.file.type || undefined,
    };
  }

  if (source.type === "blob") {
    return {
      fileName,
      sizeBytes: source.blob.size,
      mimeType: source.blob.type || undefined,
    };
  }

  return {
    fileName: fileName ?? source.url.split("/").pop()?.split("?")[0],
  };
}

function getFileExtension(fileName: string | undefined) {
  const match = fileName?.match(/\.([a-z0-9]+)$/i);
  return match?.[1].toLowerCase();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

function createAbortError(signal?: AbortSignal) {
  return signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
