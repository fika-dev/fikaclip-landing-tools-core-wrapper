import type { AdjustAudioVolumeRepository, MediaEditEntity } from "../../../domain";
import { executeWebMAudioEdit } from "./MediabunnyAudioEditConversion";
import { applyTimedGains } from "./MediabunnyAudioSampleTransform";

export class MediabunnyAdjustAudioVolumeRepository implements AdjustAudioVolumeRepository {
  readonly id = "mediabunny-adjust-audio-volume";

  execute(entity: MediaEditEntity) {
    const command = entity.command;
    if (command.operation !== "adjust-volume") throw new Error("Volume repository received an invalid command.");
    const ranges = command.segments.map((segment) => ({
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      gain: Math.max(0, segment.volume),
    }));
    return executeWebMAudioEdit(entity, {
      codec: "opus",
      forceTranscode: true,
      process: (sample) => applyTimedGains(sample, ranges),
    });
  }
}
