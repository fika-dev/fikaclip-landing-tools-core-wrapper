import type { FileData } from "@ffmpeg/ffmpeg";

import {
  normalizeAudioCodec,
  normalizeContainerFormat,
  type AudioTrackInfo,
  type InspectMediaEntity,
  type MediaInspectionResult,
  type MediaProbeRepository,
  type MediaSource,
} from "../../domain";
import { FfmpegRuntime, readFfmpegText, type FfmpegRuntimeConfig } from "../ffmpeg/FfmpegRuntime";
import { BrowserMediaProbeRepository } from "./BrowserMediaProbeRepository";

type ProbeRuntime = Pick<
  FfmpegRuntime,
  "writeFile" | "readFile" | "deleteFile" | "ffprobe" | "terminate"
>;

export type FfmpegMediaProbeRepositoryConfig = FfmpegRuntimeConfig & {
  runtime?: ProbeRuntime;
};

export class FfmpegMediaProbeRepository implements MediaProbeRepository {
  readonly id = "ffmpeg-media-probe";
  private readonly runtime: ProbeRuntime;
  private readonly browserProbe = new BrowserMediaProbeRepository();

  constructor(config: FfmpegMediaProbeRepositoryConfig) {
    this.runtime = config.runtime ?? new FfmpegRuntime(config);
  }

  async execute(entity: InspectMediaEntity): Promise<InspectMediaEntity> {
    const browserEntity = await this.browserProbe.execute(entity);
    const { command, jobId } = entity;
    const inputPath = createInputPath(command.fileName, command.source);
    const outputPath = `${inputPath}.probe.json`;

    command.job?.onProgress?.({ jobId, phase: "probing", ratio: 0.45 });
    try {
      await this.runtime.writeFile(inputPath, sourceToFileLike(command.source), { signal: command.job?.signal });
      const exitCode = await this.runtime.ffprobe(
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", "-o", outputPath, inputPath],
        { signal: command.job?.signal },
      );
      if (exitCode !== 0) throw new Error(`ffprobe failed with exit code ${exitCode}.`);

      const probe = parseProbe(readFfmpegText(await this.runtime.readFile(outputPath)));
      const result = mergeProbeResult(browserEntity.result, probe);
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });
      return { ...browserEntity, result };
    } finally {
      await Promise.all([inputPath, outputPath].map((path) => this.runtime.deleteFile(path)));
    }
  }

  dispose() {
    this.runtime.terminate();
  }
}

type ProbeJson = {
  format?: { format_name?: string; format_long_name?: string };
  streams?: Array<{
    index?: number;
    codec_type?: string;
    codec_name?: string;
    codec_long_name?: string;
    profile?: string;
    bit_rate?: string;
    sample_rate?: string;
    channels?: number;
    tags?: { language?: string; title?: string };
    disposition?: { default?: number; forced?: number };
  }>;
};

function parseProbe(text: string): ProbeJson {
  try {
    return JSON.parse(text) as ProbeJson;
  } catch {
    throw new Error("ffprobe returned invalid media metadata.");
  }
}

function mergeProbeResult(browserResult: MediaInspectionResult | undefined, probe: ProbeJson): MediaInspectionResult {
  const audioStreams = (probe.streams ?? []).filter((stream) => stream.codec_type === "audio");
  const audioTracks = audioStreams.map((stream, index): AudioTrackInfo => ({
    index,
    streamIndex: stream.index ?? index,
    codec: normalizeAudioCodec(stream.codec_name) ?? stream.codec_name,
    profile: stream.profile,
    bitrate: toNumber(stream.bit_rate),
    sampleRate: toNumber(stream.sample_rate),
    channels: stream.channels,
    language: stream.tags?.language,
    title: stream.tags?.title,
    isDefault: stream.disposition?.default === 1,
    isForced: stream.disposition?.forced === 1,
  }));
  const rawFormat = probe.format?.format_name?.split(",")[0] ?? browserResult?.rawFormat;
  const rawAudioCodec = audioStreams[0]?.codec_name ?? browserResult?.rawAudioCodec;

  return {
    ...browserResult,
    format: normalizeContainerFormat(rawFormat) ?? browserResult?.format,
    rawFormat,
    audioCodec: normalizeAudioCodec(rawAudioCodec) ?? browserResult?.audioCodec,
    rawAudioCodec,
    audioTracks,
    metadata: {
      ...(browserResult?.metadata ?? {}),
      container: rawFormat,
      audio: rawAudioCodec ? { codec: rawAudioCodec } : browserResult?.metadata.audio,
    },
  };
}

function sourceToFileLike(source: MediaSource) {
  if (source.type === "file") return source.file;
  if (source.type === "blob") return source.blob;
  return source.url;
}

function createInputPath(fileName: string | undefined, source: MediaSource) {
  const name = fileName ?? (source.type === "file" ? source.file.name : "input.video");
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toNumber(value: string | number | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
