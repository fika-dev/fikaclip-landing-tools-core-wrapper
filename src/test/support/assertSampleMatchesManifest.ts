import assert from "node:assert/strict";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { probeMediaProfile } from "./probeMediaProfile";
import { toProbeAudioCodecName } from "./toProbeAudioCodecName";
import { toProbeVideoCodecName } from "./toProbeVideoCodecName";

/** Container timestamp handling makes 1-second clips land near, not on, 1.000s. */
const DURATION_TOLERANCE_SECONDS = 0.1;

/**
 * Confirms a committed fixture really is what the manifest claims.
 *
 * Without this, a mislabelled or re-encoded sample would quietly turn every
 * assertion downstream into a statement about the wrong codec.
 */
export async function assertSampleMatchesManifest(sample: CodecSampleVideo): Promise<void> {
  const profile = await probeMediaProfile(sample.filePath);

  assert.equal(profile.container, sample.container, `${sample.fileName} container`);
  assert.equal(profile.videoCodec, toProbeVideoCodecName(sample.videoCodec), `${sample.fileName} video codec`);
  assert.equal(profile.audioCodec, toProbeAudioCodecName(sample.audioCodec), `${sample.fileName} audio codec`);
  assert.equal(profile.width, sample.width, `${sample.fileName} width`);
  assert.equal(profile.height, sample.height, `${sample.fileName} height`);
  assert.equal(profile.sampleRate, sample.sampleRate, `${sample.fileName} sample rate`);
  assert.equal(profile.channels, sample.channels, `${sample.fileName} channels`);
  assert.ok(
    profile.durationSeconds !== undefined &&
      Math.abs(profile.durationSeconds - sample.durationSeconds) <= DURATION_TOLERANCE_SECONDS,
    `${sample.fileName} duration: expected ~${sample.durationSeconds}s, received ${profile.durationSeconds}s`,
  );
}
