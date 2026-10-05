import assert from "node:assert/strict";

import type { AudioAdditionOutcome } from "./insertBeepIntoSample";

export type ExpectedAudioAddition = {
  container: string;
  /** ffprobe spelling, because `-c:v copy` must carry the source codec through. */
  videoCodec: string;
  mimeType: string;
  durationSeconds?: number;
};

/** `-shortest` trims against the source, so the output lands near 1 second. */
const DURATION_TOLERANCE_SECONDS = 0.2;

/**
 * Asserts the shape every successful add-audio output shares today.
 *
 * The audio codec is always AAC because `FfmpegMediaEditRepository` hardcodes
 * `-c:a aac` for this operation regardless of the container, and the video is
 * expected to survive untouched because the same branch hardcodes `-c:v copy`.
 */
export function assertBeepWasInserted(outcome: AudioAdditionOutcome, expected: ExpectedAudioAddition): void {
  const { profile } = outcome;

  assert.equal(profile.container, expected.container, "output container");
  assert.equal(profile.videoCodec, expected.videoCodec, "video codec survives -c:v copy");
  assert.equal(profile.videoStreamCount, 1, "output video stream count");
  assert.equal(profile.audioCodec, "aac", "output audio codec (-c:a aac is hardcoded)");
  assert.equal(profile.audioStreamCount, 1, "output audio stream count");
  assert.equal(profile.channels, 2, "output channel count");
  assert.equal(profile.sampleRate, 48000, "output sample rate");
  assert.equal(outcome.resultMimeType, expected.mimeType, "result MIME type");
  assert.ok(outcome.resultSizeBytes > 0, "result must not be empty");

  const expectedDuration = expected.durationSeconds ?? 1;
  assert.ok(
    profile.durationSeconds !== undefined &&
      Math.abs(profile.durationSeconds - expectedDuration) <= DURATION_TOLERANCE_SECONDS,
    `output duration: expected ~${expectedDuration}s, received ${profile.durationSeconds}s`,
  );

  // Codec names alone would also pass for an empty stream. Loudness proves the
  // beep was decoded, mixed and encoded rather than just declared.
  assert.ok(
    !outcome.loudness.isSilent,
    `inserted beep is inaudible (mean volume ${outcome.loudness.meanVolumeDb} dB)`,
  );
}
