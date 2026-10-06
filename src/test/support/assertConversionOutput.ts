import assert from "node:assert/strict";

import {
  assertFrameMatchesSource,
  STREAM_COPY_PIXEL_TOLERANCE,
  TRANSCODE_PIXEL_TOLERANCE,
} from "./assertFrameMatchesSource";
import type { SampleMeasurement } from "./measureSample";
import type { FormatConversionCaseOutcome } from "./runFormatConversionCase";

export type ExpectedConversion = {
  container: string;
  mimeType: string;
  /** ffprobe spelling, e.g. `hevc` rather than `h265`. */
  videoCodec: string;
  audioCodec: string;
  mode: "remux" | "transcode";
};

/** Container timestamp handling shifts a 1-second clip by a few milliseconds. */
const DURATION_TOLERANCE_SECONDS = 0.1;

/** A re-encode of the fixtures moved the measurement by at most 0.4 dB in practice. */
const TRANSCODE_LOUDNESS_TOLERANCE_DB = 1.5;
const STREAM_COPY_LOUDNESS_TOLERANCE_DB = 0.2;

/**
 * Checks a conversion against the three things it has to get right.
 *
 * 1. the metadata became what was asked for,
 * 2. everything that was not asked to change survived, and
 * 3. the streams still decode to the same picture and sound.
 *
 * The third one is the part that container and codec names cannot show. A
 * conversion can write a correct-looking header over truncated packets, or drop
 * frames, or produce a black picture, and still probe exactly as requested.
 */
export function assertConversionOutput(options: {
  outcome: FormatConversionCaseOutcome;
  source: SampleMeasurement;
  expected: ExpectedConversion;
}): void {
  const { outcome, source, expected } = options;
  const { profile } = outcome;
  const isStreamCopy = expected.mode === "remux";

  // 1. 요청한 대로 바뀌었는가
  assert.equal(profile.container, expected.container, "output container");
  assert.equal(outcome.resultMimeType, expected.mimeType, "result MIME type");
  assert.equal(profile.videoCodec, expected.videoCodec, "output video codec");
  assert.equal(profile.audioCodec, expected.audioCodec, "output audio codec");
  assert.equal(outcome.plan.mode, expected.mode, "conversion mode the plan chose");
  assert.ok(outcome.resultSizeBytes > 0, "result must not be empty");

  // 2. 바꾸라고 하지 않은 것은 그대로인가
  assert.equal(profile.width, source.profile.width, "width is preserved");
  assert.equal(profile.height, source.profile.height, "height is preserved");
  assert.equal(profile.sampleRate, source.profile.sampleRate, "sample rate is preserved");
  assert.equal(profile.channels, source.profile.channels, "channel count is preserved");
  assert.equal(profile.videoStreamCount, 1, "output video stream count");
  assert.equal(profile.audioStreamCount, 1, "output audio stream count");
  assert.ok(
    profile.durationSeconds !== undefined &&
      source.profile.durationSeconds !== undefined &&
      Math.abs(profile.durationSeconds - source.profile.durationSeconds) <= DURATION_TOLERANCE_SECONDS,
    `duration drifted: source ${source.profile.durationSeconds}s, output ${profile.durationSeconds}s`,
  );

  // 3. 영상·오디오 프레임이 정상인가
  const { decode, frame } = outcome;
  assert.ok(decode, "the conversion case must run a full decode check");
  assert.equal(decode.exitCode, 0, "the output must decode from start to finish");
  assert.deepEqual(decode.errorLines, [], "the decoder must report no errors");
  assert.equal(
    decode.videoFrameCount,
    source.decode.videoFrameCount,
    `frame count changed: source ${source.decode.videoFrameCount}, output ${decode.videoFrameCount}`,
  );

  assert.ok(frame, "the conversion case must capture a frame");
  assertFrameMatchesSource(frame, source.frame, {
    tolerance: isStreamCopy ? STREAM_COPY_PIXEL_TOLERANCE : TRANSCODE_PIXEL_TOLERANCE,
  });

  assert.ok(!outcome.loudness.isSilent, `output audio is inaudible (${outcome.loudness.meanVolumeDb} dB)`);
  assert.ok(
    source.loudness.meanVolumeDb !== null && outcome.loudness.meanVolumeDb !== null,
    "both sides must have a measurable audio stream",
  );
  assert.ok(
    Math.abs(outcome.loudness.meanVolumeDb - source.loudness.meanVolumeDb) <=
      (isStreamCopy ? STREAM_COPY_LOUDNESS_TOLERANCE_DB : TRANSCODE_LOUDNESS_TOLERANCE_DB),
    `audio loudness drifted: source ${source.loudness.meanVolumeDb} dB, output ${outcome.loudness.meanVolumeDb} dB`,
  );
}
