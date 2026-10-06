import assert from "node:assert/strict";

import type { AudioLoudness } from "./detectAudioLoudness";
import type { MediaProfile } from "./probeMediaProfile";

/** The measured shape every operation runner returns. */
export type MeasuredOutcome = {
  resultMimeType: string;
  resultSizeBytes: number;
  profile: MediaProfile;
  loudness: AudioLoudness;
};

export type ExpectedMediaOutput = {
  container: string;
  mimeType: string;
  /** ffprobe spelling. `null` asserts there is no video stream at all. */
  videoCodec: string | null;
  /** ffprobe spelling. `null` asserts there is no audio stream at all. */
  audioCodec: string | null;
  /** Whether audible samples must be present. Skipped when there is no audio. */
  audible?: boolean;
  width?: number;
  height?: number;
  channels?: number;
  sampleRate?: number;
  durationSeconds?: number;
};

/** The 1-second fixtures land near, not exactly on, their nominal duration. */
const DURATION_TOLERANCE_SECONDS = 0.2;

/**
 * Asserts the measured output against an explicit expectation.
 *
 * Every operation states its own expected container and codecs rather than
 * sharing a default, because what each one is supposed to produce — copy the
 * video or re-encode it, keep the audio or replace it, drop a stream entirely —
 * is the thing under test.
 */
export function assertMediaOutput(outcome: MeasuredOutcome, expected: ExpectedMediaOutput): void {
  const { profile } = outcome;

  assert.equal(profile.container, expected.container, "output container");
  assert.equal(outcome.resultMimeType, expected.mimeType, "result MIME type");
  assert.ok(outcome.resultSizeBytes > 0, "result must not be empty");

  if (expected.videoCodec === null) {
    assert.equal(profile.videoStreamCount, 0, "output must carry no video stream");
  } else {
    assert.equal(profile.videoCodec, expected.videoCodec, "output video codec");
    assert.equal(profile.videoStreamCount, 1, "output video stream count");
  }

  if (expected.audioCodec === null) {
    assert.equal(profile.audioStreamCount, 0, "output must carry no audio stream");
  } else {
    assert.equal(profile.audioCodec, expected.audioCodec, "output audio codec");
    assert.equal(profile.audioStreamCount, 1, "output audio stream count");
  }

  if (expected.width !== undefined) assert.equal(profile.width, expected.width, "output width");
  if (expected.height !== undefined) assert.equal(profile.height, expected.height, "output height");
  if (expected.channels !== undefined) assert.equal(profile.channels, expected.channels, "output channel count");
  if (expected.sampleRate !== undefined) assert.equal(profile.sampleRate, expected.sampleRate, "output sample rate");

  if (expected.durationSeconds !== undefined) {
    assert.ok(
      profile.durationSeconds !== undefined &&
        Math.abs(profile.durationSeconds - expected.durationSeconds) <= DURATION_TOLERANCE_SECONDS,
      `output duration: expected ~${expected.durationSeconds}s, received ${profile.durationSeconds}s`,
    );
  }

  // Codec names alone would also pass for an empty stream, so loudness is what
  // proves audio was actually decoded, processed and encoded.
  if (expected.audible === true) {
    assert.ok(!outcome.loudness.isSilent, `output is inaudible (mean volume ${outcome.loudness.meanVolumeDb} dB)`);
  }
  if (expected.audible === false) {
    assert.ok(outcome.loudness.isSilent, `output is audible (mean volume ${outcome.loudness.meanVolumeDb} dB)`);
  }
}
