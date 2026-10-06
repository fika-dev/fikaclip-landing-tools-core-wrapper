import { describe, it } from "node:test";

import type { AudioVolumeSegment } from "../../index";
import {
  adjustSampleVolume,
  assertMediaOutput,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/mp4";

/**
 * Volume adjustment re-encodes audio to AAC and copies the video, so MP4 is a
 * valid target: it carries both H.264/H.265 video and AAC audio.
 *
 * The source audio is the subject of this operation, which is the opposite of
 * add-audio — there the source audio is discarded.
 */
const HALF_VOLUME: AudioVolumeSegment[] = [{ startSeconds: 0, endSeconds: 1, volume: 0.5 }];

describe("mp4 컨테이너 오디오 볼륨 조절", () => {
  describe("볼륨 스펙별", () => {
    it("전체 구간을 0.5배로 줄이면 여전히 들린다", async () => {
      const outcome = await adjustSampleVolume({ sample: PINNED_SAMPLE, segments: HALF_VOLUME });

      assertMediaOutput(outcome, {
        container: "mp4",
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
      // Proof that this operation acts on the source audio: there is no injected
      // track here, so silencing the filter can only silence the original.
      const outcome = await adjustSampleVolume({
        sample: PINNED_SAMPLE,
        segments: [{ startSeconds: 0, endSeconds: 1, volume: 0 }],
      });

      assertMediaOutput(outcome, {
        container: "mp4",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: false,
      });
    });

    it("구간이 비어 있으면 중립 필터가 적용되어 소리가 남는다", async () => {
      // An empty list makes the repository emit `volume=1` rather than no filter,
      // so the audio is still re-encoded but not changed.
      const outcome = await adjustSampleVolume({ sample: PINNED_SAMPLE, segments: [] });

      assertMediaOutput(outcome, {
        container: "mp4",
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
          container: "mp4",
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
