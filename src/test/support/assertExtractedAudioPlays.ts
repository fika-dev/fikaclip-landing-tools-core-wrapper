import assert from "node:assert/strict";

import type { SampleMeasurement } from "./measureSample";
import type { MediaEditCaseOutcome } from "./runMediaEditCase";

export type ExpectedExtractedAudio = {
  /** Audio container, as `probeMediaProfile` normalises it. */
  container: string;
  mimeType: string;
  /** ffprobe spelling of the codec the format implies. */
  audioCodec: string;
};

/** Extraction re-encodes; LAME came out 0.5 dB under the source, AAC and Opus level. */
const LOUDNESS_TOLERANCE_DB = 1;

/** Encoder padding and delay shift a 1-second clip by a few milliseconds. */
const DURATION_TOLERANCE_SECONDS = 0.05;

/**
 * Asserts an extracted file is something a player could actually open.
 *
 * Codec names and a loudness reading are not enough on their own. A probe only
 * reads headers, so a file whose header is well-formed over mislabelled packets
 * looks exactly like a good one — which is precisely how the `.wav` output
 * passes a probe and then fails to decode. Running the whole stream through a
 * decoder and requiring silence from the decoder is what separates the two.
 *
 * The rest compares against the source: an extraction that halved the duration,
 * resampled, dropped a channel or came out at the wrong level would still decode
 * cleanly.
 */
export function assertExtractedAudioPlays(
  outcome: MediaEditCaseOutcome,
  source: SampleMeasurement,
  expected: ExpectedExtractedAudio,
): void {
  const { profile, decode, loudness } = outcome;

  assert.equal(profile.container, expected.container, "extracted container");
  assert.equal(outcome.resultMimeType, expected.mimeType, "result MIME type");
  assert.equal(profile.audioCodec, expected.audioCodec, "extracted audio codec");
  assert.equal(profile.audioStreamCount, 1, "extracted audio stream count");
  assert.equal(profile.videoStreamCount, 0, "`-vn` must drop the video");
  assert.ok(outcome.resultSizeBytes > 0, "result must not be empty");

  // Decodes end to end with nothing to say — the actual "it plays" check.
  assert.ok(decode, "the extraction case must run a full decode check");
  assert.equal(decode.exitCode, 0, "the extracted audio must decode from start to finish");
  assert.deepEqual(decode.errorLines, [], "the decoder must report no errors");

  // Same audio as the source, not merely *some* audio.
  assert.equal(profile.sampleRate, source.profile.sampleRate, "sample rate is preserved");
  assert.equal(profile.channels, source.profile.channels, "channel count is preserved");
  assert.ok(
    profile.durationSeconds !== undefined &&
      source.profile.durationSeconds !== undefined &&
      Math.abs(profile.durationSeconds - source.profile.durationSeconds) <= DURATION_TOLERANCE_SECONDS,
    `duration drifted: source ${source.profile.durationSeconds}s, extracted ${profile.durationSeconds}s`,
  );

  assert.ok(!loudness.isSilent, `extracted audio is inaudible (${loudness.meanVolumeDb} dB)`);
  assert.ok(
    source.loudness.meanVolumeDb !== null && loudness.meanVolumeDb !== null,
    "both source and extracted audio must be measurable",
  );
  assert.ok(
    Math.abs(loudness.meanVolumeDb - source.loudness.meanVolumeDb) <= LOUDNESS_TOLERANCE_DB,
    `level drifted: source ${source.loudness.meanVolumeDb} dB, extracted ${loudness.meanVolumeDb} dB`,
  );
}
