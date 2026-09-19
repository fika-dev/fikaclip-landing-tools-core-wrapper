import {
  normalizeAudioCodec,
  normalizeContainerFormat,
  type AudioTrackInfo,
  type InspectMediaEntity,
  type MediaInspectionResult,
  type MediaProbeRepository,
  type MediaSource,
} from "../../domain";
import { FfmpegRuntime, type FfmpegRuntimeConfig } from "../ffmpeg/FfmpegRuntime";
import { BrowserMediaProbeRepository } from "./BrowserMediaProbeRepository";

type ProbeRuntime = Pick<
  FfmpegRuntime,
  "writeFile" | "deleteFile" | "exec" | "terminate"
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

    command.job?.onProgress?.({ jobId, phase: "probing", ratio: 0.45 });
    try {
      await this.runtime.writeFile(inputPath, sourceToFileLike(command.source), { signal: command.job?.signal });
      const audioTrackCount = await detectAudioTrackCount(this.runtime, inputPath, command.job?.signal);
      const result = mergeProbeResult(browserEntity.result, audioTrackCount);
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });
      return { ...browserEntity, result };
    } finally {
      await this.runtime.deleteFile(inputPath);
    }
  }

  dispose() {
    this.runtime.terminate();
  }
}

async function detectAudioTrackCount(runtime: ProbeRuntime, inputPath: string, signal?: AbortSignal) {
  const tracks: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    const exitCode = await runtime.exec(
      ["-v", "error", "-i", inputPath, "-map", `0:a:${index}`, "-t", "0.01", "-f", "null", "-"],
      { signal },
    );
    if (exitCode !== 0) break;
    tracks.push(index);
  }
  return tracks;
}

function mergeProbeResult(browserResult: MediaInspectionResult | undefined, audioTrackIndexes: number[]): MediaInspectionResult {
  const rawAudioCodec = browserResult?.rawAudioCodec;
  const audioTracks = audioTrackIndexes.map((index): AudioTrackInfo => ({
    index,
    streamIndex: index,
    codec: index === 0 ? normalizeAudioCodec(rawAudioCodec) ?? rawAudioCodec : undefined,
    isDefault: index === 0,
  }));

  return {
    ...browserResult,
    format: normalizeContainerFormat(browserResult?.rawFormat) ?? browserResult?.format,
    rawFormat: browserResult?.rawFormat,
    audioCodec: normalizeAudioCodec(rawAudioCodec) ?? browserResult?.audioCodec,
    rawAudioCodec,
    audioTracks,
    metadata: {
      ...(browserResult?.metadata ?? {}),
      container: browserResult?.rawFormat,
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
