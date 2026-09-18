import type { AudioCodec, VideoCodec, VideoContainerFormat } from "../entity";

export function normalizeContainerFormat(format: string | undefined): VideoContainerFormat | undefined {
  if (!format) return undefined;
  if (format.includes("mp4")) return "mp4";
  if (format.includes("webm")) return "webm";
  if (format.includes("mov") || format.includes("quicktime")) return "mov";
  if (format.includes("mkv") || format.includes("matroska")) return "mkv";
  return undefined;
}

export function normalizeVideoCodec(codec: string | undefined): VideoCodec | undefined {
  if (!codec) return undefined;
  if (codec === "h264" || codec === "avc1" || codec === "avc3") return "h264";
  if (codec === "hevc" || codec === "h265" || codec === "hvc1" || codec === "hev1") return "h265";
  if (codec === "vp8" || codec === "vp08") return "vp8";
  if (codec === "vp9" || codec === "vp09") return "vp9";
  if (codec === "av1" || codec === "av01") return "av1";
  return undefined;
}

export function normalizeAudioCodec(codec: string | undefined): AudioCodec | undefined {
  if (!codec) return undefined;
  if (codec === "aac") return "aac";
  if (codec === "opus") return "opus";
  if (codec === "mp3" || codec === "mp3float" || codec === "mp3adu" || codec === "mp3on4") return "mp3";
  return undefined;
}
