import path from "node:path";

import { spawnCommand } from "./spawnCommand";

export type MediaProfile = {
  container: string;
  durationSeconds?: number;
  videoCodec?: string;
  videoStreamCount: number;
  audioCodec?: string;
  audioStreamCount: number;
  sampleRate?: number;
  channels?: number;
  width?: number;
  height?: number;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
};

export async function probeMediaProfile(filePath: string): Promise<MediaProfile> {
  const outcome = await spawnCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=format_name,duration:stream=codec_type,codec_name,width,height,sample_rate,channels",
    "-of",
    "json",
    filePath,
  ]);

  if (outcome.exitCode !== 0) {
    throw new Error(`ffprobe failed for ${filePath} with exit code ${outcome.exitCode}.\n${outcome.stderr}`);
  }

  const probe = JSON.parse(outcome.stdout) as {
    format?: { format_name?: string; duration?: string };
    streams?: ProbeStream[];
  };
  const streams = probe.streams ?? [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration);

  return {
    container: normalizeContainer(probe.format?.format_name, filePath),
    durationSeconds: Number.isFinite(duration) ? duration : undefined,
    videoCodec: videoStreams[0]?.codec_name,
    videoStreamCount: videoStreams.length,
    audioCodec: audioStreams[0]?.codec_name,
    audioStreamCount: audioStreams.length,
    sampleRate: audioStreams[0]?.sample_rate === undefined ? undefined : Number(audioStreams[0].sample_rate),
    channels: audioStreams[0]?.channels,
    width: videoStreams[0]?.width,
    height: videoStreams[0]?.height,
  };
}

/**
 * ffprobe reports a *set* of candidate formats, not one. Both `.mkv` and `.webm`
 * come back as `matroska,webm` because WebM is a constrained Matroska profile,
 * so picking the first entry would label every Matroska file as WebM.
 *
 * The file extension is the only signal that distinguishes them here, which is
 * the same thing the ffmpeg muxer uses when it picks an output format.
 */
function normalizeContainer(formatName: string | undefined, filePath: string): string {
  const candidates = String(formatName ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const extension = path.extname(filePath).replace(".", "").toLowerCase();

  if (candidates.includes(extension)) return extension;
  if (extension === "mkv" && candidates.includes("matroska")) return "mkv";
  if (candidates.includes("mov")) return "mov";

  return candidates[0] ?? "";
}
