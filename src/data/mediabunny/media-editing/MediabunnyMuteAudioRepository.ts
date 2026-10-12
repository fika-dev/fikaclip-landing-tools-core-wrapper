import type { MediaEditEntity, MuteAudioRepository } from "../../../domain";
import { executeWebMAudioEdit } from "./MediabunnyAudioEditConversion";
import { applyTimedGains } from "./MediabunnyAudioSampleTransform";

export class MediabunnyMuteAudioRepository implements MuteAudioRepository {
  readonly id = "mediabunny-mute-audio";

  execute(entity: MediaEditEntity) {
    const command = entity.command;
    if (command.operation !== "mute") throw new Error("Mute repository received an invalid command.");
    if (command.muteAll) return executeWebMAudioEdit(entity, { discard: true });

    const ranges = (command.segments ?? []).map((segment) => ({ ...segment, gain: 0 }));
    return executeWebMAudioEdit(entity, {
      codec: "opus",
      forceTranscode: true,
      process: (sample) => applyTimedGains(sample, ranges),
    });
  }
}
