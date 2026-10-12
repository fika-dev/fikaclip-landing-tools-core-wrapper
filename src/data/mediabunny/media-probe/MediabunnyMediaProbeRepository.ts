import { ALL_FORMATS, BlobSource, Input, UrlSource } from "mediabunny";

import type { InspectMediaEntity, MediaProbeRepository, MediaSource } from "../../../domain";

export class MediabunnyMediaProbeRepository implements MediaProbeRepository {
  readonly id = "mediabunny-media-probe";

  constructor(private readonly baseProbeRepository?: MediaProbeRepository) {}

  async execute(entity: InspectMediaEntity): Promise<InspectMediaEntity> {
    const baseEntity = this.baseProbeRepository ? await this.baseProbeRepository.execute(entity) : entity;
    const input = new Input({ source: createSource(entity.command.source), formats: ALL_FORMATS });

    try {
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) return baseEntity;

      const metrics = await videoTrack.computeFrameRateMetrics({ targetPacketCount: 256 });
      const frameRate = normalizeFrameRate(metrics.bestGuessFrameRate);
      if (frameRate === undefined) return baseEntity;

      return {
        ...baseEntity,
        result: baseEntity.result
          ? {
              ...baseEntity.result,
              fps: frameRate,
              metadata: { ...baseEntity.result.metadata, frameRate },
            }
          : undefined,
      };
    } catch {
      return baseEntity;
    } finally {
      input.dispose();
    }
  }
}

function createSource(source: MediaSource) {
  if (source.type === "file") return new BlobSource(source.file);
  if (source.type === "blob") return new BlobSource(source.blob);
  return new UrlSource(source.url);
}

function normalizeFrameRate(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 240) return undefined;
  return Math.round(value * 1000) / 1000;
}
