import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import type { AudioVolumeSegment } from "../../index";
import {
  adjustSampleVolume,
  assertMediaOutput,
  assertSegmentVolumes,
  loadCodecSampleMatrix,
  measureSample,
  toProbeVideoCodecName,
  type AudioSegmentWindow,
  type CodecSampleVideo,
  type MediaEditCaseOutcome,
  type SampleMeasurement,
} from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");

const EXPECTED_MIME_TYPE = "video/webm";

/**
 * Where to measure, for an operation that changes the first half of a 1-second
 * fixture and leaves the second.
 *
 * The untouched half is the control: measuring the whole file would hide a filter
 * that hit the wrong range, or the whole track, because the overall average moves
 * either way.
 *
 * Both windows stop short of the 0.5s switch point on purpose. AAC frames are
 * 1024 samples — about 21ms — and neither the filter's switch nor `-ss`/`-t`
 * trimming lands on a frame boundary, so a window that reaches the switch mixes
 * in samples from the other side. Measured flush against it, a halving reads as
 * -5.0 dB instead of -6.02 and a silenced half reads as -50 dB instead of -91.
 * With this margin both come out within 0.02 dB of theory.
 */
const FIRST_HALF: AudioSegmentWindow = { startSeconds: 0.05, durationSeconds: 0.35 };
const SECOND_HALF: AudioSegmentWindow = { startSeconds: 0.6, durationSeconds: 0.35 };
const HALVES = [FIRST_HALF, SECOND_HALF] as const;

const firstHalfAt = (volume: number): AudioVolumeSegment[] => [{ startSeconds: 0, endSeconds: 0.5, volume }];

/**
 * Volume adjustment re-encodes audio to AAC and copies the video, and it applies
 * `-af` without a `-map`, so it works on whichever single audio track FFmpeg
 * selects. The command has no track selector — see the multi-track group.
 *
 * WebM has no valid combination today. The operation hardcodes `-c:a aac` without
 * consulting the container, so the WebM muxer rejects every output. When the
 * repository learns to pick a container-legal encoder — Opus for WebM, which
 * `CodecCompatibilityRepository` already knows — these cases will start failing,
 * and that is the signal to turn them into the success assertions the other three
 * containers use.
 */
describe("webm 컨테이너 오디오 볼륨 조절", () => {
  const measurements = new Map<string, SampleMeasurement>();

  before(async () => {
    // Each slice is compared against the same slice of the source, so the
    // sources are measured over the same windows.
    for (const sample of MATRIX.withVideo("vp9")) {
      measurements.set(sample.fileName, await measureSample(sample, { segmentWindows: HALVES }));
    }
  });

  const sourceOf = (sample: CodecSampleVideo) => {
    const measurement = measurements.get(sample.fileName);
    assert.ok(measurement?.segments, `missing slice measurements for ${sample.fileName}`);
    return measurement.segments;
  };

  const segmentsOf = (outcome: MediaEditCaseOutcome) => {
    assert.ok(outcome.segments, "the case must be run with segmentWindows");
    return outcome.segments;
  };

  describe("현재 동작 기록: WebM 먹서가 AAC 를 거부해 모든 조절이 실패한다", () => {
    for (const sample of MATRIX.withVideo("vp9")) {
      it(`${sample.audioCodec} 소스의 볼륨 조절이 '-c:a aac' 하드코딩 때문에 실패한다`, async () => {
        await assert.rejects(
          () => adjustSampleVolume({ sample, segments: firstHalfAt(0.5), segmentWindows: HALVES }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /ffmpeg adjust-volume failed with exit code \d+\./);
            assert.match(error.message, /-c:a aac/);
            assert.match(error.message, /supported for WebM/);
            return true;
          },
        );
      });
    }

    for (const sample of MATRIX.withAudio("opus")) {
      it(`${sample.videoCodec} 영상의 볼륨 조절도 동일하게 실패한다`, async () => {
        // Sweeping the video axis shows the failure is about the audio codec: VP8,
        // VP9 and AV1 are all in WebM's profile, so none of them is the cause.
        await assert.rejects(
          () => adjustSampleVolume({ sample, segments: firstHalfAt(0.5) }),
          /supported for WebM/,
        );
      });
    }
  });
});
