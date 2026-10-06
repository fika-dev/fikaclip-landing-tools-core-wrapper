import { describe, it } from "node:test";

import type { AudioVolumeSegment } from "../../index";
import {
  adjustSampleVolume,
  assertMediaOutput,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mkv");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/x-matroska";

/**
 * Matroska accepts anything, so volume adjustment is valid here for every
 * source — including the VP9 sources, whose video is copied through into MKV
 * even though the same VP9 stream in a WebM output would reject the AAC audio
 * this operation produces.
 */
const HALF_VOLUME: AudioVolumeSegment[] = [{ startSeconds: 0, endSeconds: 1, volume: 0.5 }];

describe("mkv 컨테이너 오디오 볼륨 조절", () => {
  describe("볼륨 스펙별", () => {
    it("전체 구간을 0.5배로 줄이면 여전히 들린다", async () => {
      const outcome = await adjustSampleVolume({ sample: PINNED_SAMPLE, segments: HALF_VOLUME });

      assertMediaOutput(outcome, {
        container: "mkv",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: true,
        channels: 2,
        sampleRate: 48000,
        durationSeconds: 1,
      });
    });

    it("전체 구간을 0배로 줄이면 무음이 된다", async () => {
      const outcome = await adjustSampleVolume({
        sample: PINNED_SAMPLE,
        segments: [{ startSeconds: 0, endSeconds: 1, volume: 0 }],
      });

      assertMediaOutput(outcome, {
        container: "mkv",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: false,
      });
    });

    it("구간이 비어 있으면 중립 필터가 적용되어 소리가 남는다", async () => {
      const outcome = await adjustSampleVolume({ sample: PINNED_SAMPLE, segments: [] });

      assertMediaOutput(outcome, {
        container: "mkv",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: true,
      });
    });
  });

  describe("소스 비디오/오디오 코덱별", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스의 비디오가 보존되고 오디오만 aac 로 바뀐다`, async () => {
        const outcome = await adjustSampleVolume({ sample, segments: HALF_VOLUME });

        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: "aac",
          audible: true,
          durationSeconds: 1,
        });
      });
    }
  });
});
