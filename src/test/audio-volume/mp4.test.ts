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
import {
  detectAudioLoudness,
  loadMultiTrackAudioSample,
  MULTI_TRACK_LEVELS_DB,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/mp4";

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
 * MP4 carries AAC, so every source codec here — AAC, MP3 and Opus — can have
 * its volume adjusted.
 */
describe("mp4 컨테이너 오디오 볼륨 조절", () => {
  const measurements = new Map<string, SampleMeasurement>();

  before(async () => {
    // Each slice is compared against the same slice of the source, so the
    // sources are measured over the same windows.
    for (const sample of MATRIX.withVideo("h264")) {
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
    for (const sample of MATRIX.withVideo("h264")) {
      it(`${sample.audioCodec} 소스의 앞 절반만 -6 dB 가 된다`, async () => {
        const outcome = await adjustSampleVolume({
          sample,
          segments: firstHalfAt(0.5),
          segmentWindows: HALVES,
        });

        assertMediaOutput(outcome, {
          container: "mp4",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: "aac",
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

  /**
   * What happens when the source has more than one audio track.
   *
   * The command carries only `segments` — there is no track selector — and the
   * repository passes `-af` with no `-map`, so FFmpeg's default stream selection
   * picks one audio track, adjusts that, and discards the rest. Targeting "the
   * second of three tracks" is therefore not expressible today, and asking for it
   * would need a new field on the command plus explicit `-map` arguments.
   *
   * The fixture's three tracks sit 20 dB apart so the survivor is identifiable by
   * level alone.
   */
  describe("현재 한계: 오디오 트랙이 여러 개면 첫 트랙만 남는다", () => {
    const MULTI_TRACK_SAMPLE = loadMultiTrackAudioSample();

    it("트랙 3개가 1개로 줄고, 살아남는 것은 첫 트랙이다", async () => {
      const sourceTrackLevels = await Promise.all(
        MULTI_TRACK_LEVELS_DB.map((_, trackIndex) =>
          detectAudioLoudness(MULTI_TRACK_SAMPLE.filePath, { trackIndex, window: SECOND_HALF }),
        ),
      );

      // Precondition: the fixture's tracks really are distinguishable by level.
      sourceTrackLevels.forEach((level, trackIndex) => {
        assert.ok(level.meanVolumeDb !== null, `source track ${trackIndex} must be measurable`);
        assert.ok(
          Math.abs(level.meanVolumeDb - MULTI_TRACK_LEVELS_DB[trackIndex]) <= 1,
          `source track ${trackIndex}: expected ~${MULTI_TRACK_LEVELS_DB[trackIndex]} dB, measured ${level.meanVolumeDb} dB`,
        );
      });

      const outcome = await adjustSampleVolume({
        sample: MULTI_TRACK_SAMPLE,
        segments: firstHalfAt(0.5),
        segmentWindows: HALVES,
      });

      assert.equal(outcome.profile.audioStreamCount, 1, "two of the three tracks are dropped");

      const [adjusted, untouched] = segmentsOf(outcome);
      assert.ok(untouched.meanVolumeDb !== null && adjusted.meanVolumeDb !== null);
      // The untouched half identifies which track survived.
      assert.ok(
        Math.abs(untouched.meanVolumeDb - MULTI_TRACK_LEVELS_DB[0]) <= 1,
        `the surviving track should be track 0 at ~${MULTI_TRACK_LEVELS_DB[0]} dB, measured ${untouched.meanVolumeDb} dB`,
      );
      // And the requested slice of that one track did move by the requested gain.
      assertSegmentVolumes({
        outputSegments: [adjusted, untouched],
        sourceSegments: [sourceTrackLevels[0], sourceTrackLevels[0]],
        expected: [
          { volume: 0.5, label: "살아남은 트랙의 앞 절반" },
          { volume: 1, label: "살아남은 트랙의 뒤 절반" },
        ],
      });
    });
  });
});
