import {
  type AudioTrackInfo,
  type InspectMediaEntity,
  type MediaCommandRuntime,
  type MediaInspectionResult,
  type MediaProbeRepository,
  type MediaSource,
  normalizeAudioCodec,
  normalizeContainerFormat,
} from "../../../domain";

export type FfmpegMediaProbeRepositoryConfig = {
  runtime: MediaCommandRuntime;
  baseProbeRepository?: MediaProbeRepository;
};

export class FfmpegMediaProbeRepository implements MediaProbeRepository {
  readonly id = "ffmpeg-media-probe";
  private readonly runtime: MediaCommandRuntime;
  private readonly baseProbeRepository?: MediaProbeRepository;

  constructor(config: FfmpegMediaProbeRepositoryConfig) {
    this.runtime = config.runtime;
    this.baseProbeRepository = config.baseProbeRepository;
  }

  async execute(entity: InspectMediaEntity): Promise<InspectMediaEntity> {
    const baseEntity = this.baseProbeRepository ? await this.baseProbeRepository.execute(entity) : entity;
    const { command, jobId } = entity;
    const inputPath = createInputPath(command.fileName, command.source);

    command.job?.onProgress?.({ jobId, phase: "probing", ratio: 0.45 });
    try {
      await this.runtime.writeFile(inputPath, sourceToFileLike(command.source), { signal: command.job?.signal });
      const audioTrackCount = await detectAudioTrackCount(this.runtime, inputPath, command.job?.signal);
      const result = mergeProbeResult(baseEntity.result, audioTrackCount);
      command.job?.onProgress?.({ jobId, phase: "done", ratio: 1 });
      return { ...baseEntity, result };
    } finally {
      await this.runtime.deleteFile(inputPath);
    }
  }
}

async function detectAudioTrackCount(runtime: MediaCommandRuntime, inputPath: string, signal?: AbortSignal) {
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

function mergeProbeResult(
  browserResult: MediaInspectionResult | undefined,
  audioTrackIndexes: number[],
): MediaInspectionResult {
  const rawAudioCodec = browserResult?.rawAudioCodec;
  const audioTracks = audioTrackIndexes.map(
    (index): AudioTrackInfo => ({
      index,
      streamIndex: index,
      codec: index === 0 ? normalizeAudioCodec(rawAudioCodec) ?? rawAudioCodec : undefined,
      isDefault: index === 0,
    }),
  );

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
