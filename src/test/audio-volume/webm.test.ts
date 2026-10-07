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
 * Both windows stop short of the 0.5s switch point on purpose. Audio frames are
 * ~20ms and neither the filter's switch nor `-ss`/`-t` trimming lands on a frame
 * boundary, so a window that reaches the switch mixes in samples from the other
 * side. Measured flush against it, a halving reads as -5.0 dB instead of -6.02.
 */
const FIRST_HALF: AudioSegmentWindow = { startSeconds: 0.05, durationSeconds: 0.35 };
const SECOND_HALF: AudioSegmentWindow = { startSeconds: 0.6, durationSeconds: 0.35 };
const HALVES = [FIRST_HALF, SECOND_HALF] as const;

const firstHalfAt = (volume: number): AudioVolumeSegment[] => [{ startSeconds: 0, endSeconds: 0.5, volume }];

/**
 * WebM used to fail here outright: the operation chose `-c:a aac` without
 * consulting the container, and WebM rejects AAC.
 *
 * Now it declares only that it re-encodes audio and copies video, and the
 * container supplies the codec — Opus. So the output codec differs from the other
 * containers' AAC while everything else about the operation is identical.
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

  describe("오디오 코덱별 — 앞 절반만 50% 로 줄인다", () => {
    for (const sample of MATRIX.withVideo("vp9")) {
      it(`${sample.audioCodec} 소스의 앞 절반만 -6 dB 가 된다`, async () => {
        const outcome = await adjustSampleVolume({
          sample,
          segments: firstHalfAt(0.5),
          segmentWindows: HALVES,
        });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: "opus",
          audible: true,
          channels: 2,
          sampleRate: 48000,
          durationSeconds: 1,
        });
        assertSegmentVolumes({
          outputSegments: segmentsOf(outcome),
          sourceSegments: sourceOf(sample),
          expected: [
            { volume: 0.5, label: `${sample.audioCodec} 앞 절반` },
            { volume: 1, label: `${sample.audioCodec} 뒤 절반 (건드리지 않음)` },
          ],
        });
      });
    }
  });

  describe("볼륨 배율별 — 0% 부터 200% 까지 요청한 만큼만 바뀐다", () => {
    const FACTORS = [
      { volume: 0, label: "0% (무음)" },
      { volume: 0.5, label: "50% (-6.02 dB)" },
      { volume: 1, label: "100% (변화 없음)" },
      { volume: 1.5, label: "150% (+3.52 dB)" },
      { volume: 2, label: "200% (+6.02 dB)" },
    ];

    for (const { volume, label } of FACTORS) {
      it(`${label} 로 요청하면 앞 절반만 그만큼 바뀐다`, async () => {
        const outcome = await adjustSampleVolume({
          sample: PINNED_SAMPLE,
          segments: firstHalfAt(volume),
          segmentWindows: HALVES,
        });

        assertSegmentVolumes({
          outputSegments: segmentsOf(outcome),
          sourceSegments: sourceOf(PINNED_SAMPLE),
          expected: [
            { volume, label: `앞 절반 @ ${volume}` },
            { volume: 1, label: "뒤 절반 (건드리지 않음)" },
          ],
        });
      });
    }
  });

  describe("여러 구간 — 구간마다 다른 배율이 적용되고 사이 구간은 그대로다", () => {
    /**
     * Three slices — the two the operation names, and the gap between them — each
     * kept clear of the range boundaries for the reason described above.
     */
    const SLICES: AudioSegmentWindow[] = [
      { startSeconds: 0.05, durationSeconds: 0.2 },
      { startSeconds: 0.38, durationSeconds: 0.14 },
      { startSeconds: 0.68, durationSeconds: 0.25 },
    ];

    it("앞 구간은 50%, 뒤 구간은 200%, 사이는 그대로다", async () => {
      const source = await measureSample(PINNED_SAMPLE, { segmentWindows: SLICES });
      assert.ok(source.segments, "source slices must be measured");

      const outcome = await adjustSampleVolume({
        sample: PINNED_SAMPLE,
        segments: [
          { startSeconds: 0, endSeconds: 0.3, volume: 0.5 },
          { startSeconds: 0.6, endSeconds: 1, volume: 2 },
        ],
        segmentWindows: SLICES,
      });

      assertSegmentVolumes({
        outputSegments: segmentsOf(outcome),
        sourceSegments: source.segments,
        expected: [
          { volume: 0.5, label: "[0.05, 0.25] @ 50%" },
          // The gap is what proves the two filters stayed inside their ranges.
          { volume: 1, label: "[0.38, 0.52] 사이 구간 (요청하지 않음)" },
          { volume: 2, label: "[0.68, 0.93] @ 200%" },
        ],
      });
    });

    it("구간을 비워 두면 중립 필터가 적용되어 전체가 그대로다", async () => {
      // An empty list makes the repository emit `volume=1`, so the audio is still
      // re-encoded but not changed.
      const outcome = await adjustSampleVolume({ sample: PINNED_SAMPLE, segments: [], segmentWindows: HALVES });

      assertSegmentVolumes({
        outputSegments: segmentsOf(outcome),
        sourceSegments: sourceOf(PINNED_SAMPLE),
        expected: [
          { volume: 1, label: "앞 절반" },
          { volume: 1, label: "뒤 절반" },
        ],
      });
    });
  });
});
