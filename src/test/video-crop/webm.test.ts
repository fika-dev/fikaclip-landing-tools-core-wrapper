import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type CropRegion } from "../../index";
import {
  assertMediaOutput,
  cropSample,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");
const COMBINATIONS = listSupportedOutputCombinations("webm");

const EXPECTED_MIME_TYPE = "video/webm";

const REGION: CropRegion = { x: 0, y: 0, width: 320, height: 180 };

/**
 * WebM cropping *does* have valid combinations — unlike the audio operations,
 * cropping lets the caller choose the output codecs.
 *
 * Asking for VP8/VP9 with Opus works. Only the defaults fail, and they fail for
 * both streams at once: H.264 video and AAC audio are each out of WebM's
 * profile. That makes this the clearest case for the fix being "consult the
 * container for defaults", not "support WebM".
 */
describe("webm 컨테이너 영상 크롭", () => {
  describe("지원 출력 조합별 — 코덱을 명시하면 성공한다", () => {
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

  describe("소스 비디오 코덱별 — vp9/opus 로 크롭", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스가 vp9/opus 로 재인코딩된다`, async () => {
        // AV1 sources are decoded and re-encoded to VP9 here. AV1 input still
        // works; only AV1 *output* is withdrawn.
        const outcome = await cropSample({
          sample,
          region: REGION,
          output: { videoCodec: "vp9", audioCodec: "opus" },
        });

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

  describe("비디오만 남기기", () => {
    it("vp9 + audioCodec none 조합도 유효하다", async () => {
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
