import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type CropRegion } from "../../index";
import {
  assertMediaOutput,
  cropSample,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
  type MediaEditCaseOutcome,
} from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");
const COMBINATIONS = listSupportedOutputCombinations("webm");

const EXPECTED_MIME_TYPE = "video/webm";

/** The fixtures are 640x360, so this takes the top-left quarter. */
const REGION: CropRegion = { x: 0, y: 0, width: 320, height: 180 };

/**
 * Cropping always re-encodes, because the frame geometry changes, and it is one
 * of the few operations that lets the caller choose the output codecs.
 *
 * WebM cropping *does* have valid combinations, unlike the audio operations,
 * because the caller can choose the output codecs. Only the defaults fail, and
 * they fail for both streams at once: H.264 video and AAC audio are each out of
 * WebM's profile. The fix is better defaults, not new capability.
 */
describe("webm 컨테이너 영상 크롭", () => {
  describe("지원 출력 조합별", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 크롭하면 320x180 이 된다`, async () => {
        const outcome = await cropSample({ sample: PINNED_SAMPLE, region: REGION, output: { videoCodec, audioCodec } });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(videoCodec),
          audioCodec,
          audible: true,
          width: 320,
          height: 180,
        });
      });
    }
  });

  describe("소스 코덱별 — vp9/opus 로 크롭", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스가 vp9/opus 로 재인코딩된다`, async () => {
        // The source codec does not survive: cropping has to re-encode, so an
        // AV1 or HEVC source still comes out as the requested output codec.
        const outcome = await cropSample({ sample, region: REGION, output: { videoCodec: "vp9", audioCodec: "opus" } });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "vp9",
          audioCodec: "opus",
          audible: true,
          width: 320,
          height: 180,
        });
      });
    }
  });

  describe("크기 규칙", () => {
    it("홀수 크기를 요청하면 짝수로 내려간다", async () => {
      // yuv420p stores one chroma sample per 2x2 block, so an odd width or height
      // has no representation and every crop value rounds down to even.
      const outcome = await cropSample({
        sample: PINNED_SAMPLE,
        region: { x: 0, y: 0, width: 321, height: 181 }, output: { videoCodec: "vp9", audioCodec: "opus" },
      });

      assertMediaOutput(outcome, {
        container: "webm",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "vp9",
        audioCodec: "opus",
        width: 320,
        height: 180,
      });
    });
  });

  describe("오디오 제거", () => {
    it("audioCodec 을 none 으로 주면 오디오 스트림이 사라진다", async () => {
      const outcome = await cropSample({
        sample: PINNED_SAMPLE,
        region: REGION,
        output: { videoCodec: "vp9", audioCodec: "none" },
      });

      assertMediaOutput(outcome, {
        container: "webm",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "vp9",
        audioCodec: null,
        width: 320,
        height: 180,
      });
    });
  });

  describe("현재 동작 기록: 기본 코덱으로는 실패한다", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스를 기본값(h264/aac)으로 크롭하면 실패한다`, async () => {
        await assert.rejects(
          () => cropSample({ sample, region: REGION }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /ffmpeg crop failed with exit code \d+\./);
            // Both hardcoded defaults are out of profile, not just the audio.
            assert.match(error.message, /-c:v libx264/);
            assert.match(error.message, /-c:a aac/);
            assert.match(error.message, /supported for WebM/);
            return true;
          },
        );
      });
    }
  });
});

function requireFrame(outcome: MediaEditCaseOutcome) {
  assert.ok(outcome.frame, "the case must be run with captureFrame enabled");
  return outcome.frame;
}
