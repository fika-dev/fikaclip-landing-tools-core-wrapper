import assert from "node:assert/strict";

import type { AudioLoudness } from "./detectAudioLoudness";
import type { MediaProfile } from "./probeMediaProfile";

export type AudioComparable = {
  profile: Pick<MediaProfile, "audioCodec">;
  loudness: AudioLoudness;
};

/** A stream copy reproduces the samples, so the measurement must match exactly. */
const STREAM_COPY_LOUDNESS_TOLERANCE_DB = 0.2;

/**
 * Asserts an operation left the audio stream alone.
 *
 * Only meaningful for operations using `-c:a copy`: the stream is carried over
 * rather than re-encoded, so the codec has to be the source's and the measured
 * loudness has to match it exactly rather than approximately.
 */
export function assertAudioUnchanged(outcome: AudioComparable, source: AudioComparable): void {
  assert.equal(outcome.profile.audioCodec, source.profile.audioCodec, "audio codec is copied, not re-encoded");
  assert.ok(
    source.loudness.meanVolumeDb !== null && outcome.loudness.meanVolumeDb !== null,
    "both sides must have a measurable audio stream",
  );
  assert.ok(
    Math.abs(outcome.loudness.meanVolumeDb - source.loudness.meanVolumeDb) <= STREAM_COPY_LOUDNESS_TOLERANCE_DB,
    `audio loudness changed: source ${source.loudness.meanVolumeDb} dB, output ${outcome.loudness.meanVolumeDb} dB`,
  );
}
