import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type VideoContainerFormat } from "../../index";
import {
  assertMediaOutput,
  loadCodecSampleMatrix,
  runFormatConversionCase,
  toProbeVideoCodecName,
  type CodecSampleVideo,
} from "../support";

const COMBINATIONS = listSupportedOutputCombinations("webm");
const PINNED_SAMPLE = loadCodecSampleMatrix("webm").get("vp9", "opus");

const EXPECTED_MIME_TYPE = "video/webm";

const SOURCES_BY_CONTAINER: Record<VideoContainerFormat, CodecSampleVideo> = {
  mp4: loadCodecSampleMatrix("mp4").get("h264", "aac"),
  mov: loadCodecSampleMatrix("mov").get("h264", "aac"),
  webm: PINNED_SAMPLE,
  mkv: loadCodecSampleMatrix("mkv").get("vp9", "opus"),
};

/**
 * WebM conversion works, and the contrast with the editing operations is the
 * point: this operation asks `CodecCompatibilityRepository` what WebM accepts
 * and gets VP9/Opus, while add-audio, volume, mute, crop and watermark all
 * assume AAC and fail.
 *
 * Remuxing into WebM is the one place the container's profile still bites, since
 * `-c copy` carries the source codecs in whether they are in profile or not.
 */
describe("webm 로 포맷 변환", () => {
  describe("지원 출력 조합별 트랜스코딩", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 변환된다`, async () => {
        const outcome = await runFormatConversionCase({
          sample: SOURCES_BY_CONTAINER.mp4,
          output: { format: "webm", videoCodec, audioCodec },
        });

        assert.equal(outcome.plan.mode, "transcode");
        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(videoCodec),
          audioCodec,
          audible: true,
          width: 640,
          height: 360,
        });
      });
    }
  });

  describe("소스 컨테이너별 트랜스코딩", () => {
    for (const [container, sample] of Object.entries(SOURCES_BY_CONTAINER)) {
      it(`${container} 소스를 webm/vp9/opus 로 변환한다`, async () => {
        const outcome = await runFormatConversionCase({
          sample,
          output: { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
        });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "vp9",
          audioCodec: "opus",
          audible: true,
        });
      });
    }
  });

  describe("컨테이너 기본 코덱", () => {
    it("코덱을 지정하지 않고 트랜스코딩하면 vp9/opus 가 선택된다", async () => {
      // This is the knowledge the editing operations do not consult.
      const outcome = await runFormatConversionCase({
        sample: SOURCES_BY_CONTAINER.mp4,
        output: { format: "webm" },
        mode: "transcode",
      });

      assert.equal(outcome.plan.output.videoCodec, "vp9");
      assert.equal(outcome.plan.output.audioCodec, "opus");
      assertMediaOutput(outcome, {
        container: "webm",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "vp9",
        audioCodec: "opus",
        audible: true,
      });
    });
  });

  describe("리먹싱", () => {
    it("vp9/opus 소스는 webm 으로 리먹싱된다", async () => {
      const outcome = await runFormatConversionCase({
        sample: SOURCES_BY_CONTAINER.mkv,
        output: { format: "webm" },
        mode: "remux",
      });

      assert.equal(outcome.plan.mode, "remux");
      assertMediaOutput(outcome, {
        container: "webm",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "vp9",
        audioCodec: "opus",
        audible: true,
      });
    });

    it("h264/aac 소스를 webm 으로 리먹싱하면 실패한다", async () => {
      // Expected, and the planner warns about it in advance: `-c copy` cannot
      // change codecs, so an out-of-profile source has nowhere to go. The fix is
      // to transcode, which is exactly what `auto` mode would have chosen had a
      // codec been requested.
      await assert.rejects(
        () =>
          runFormatConversionCase({
            sample: SOURCES_BY_CONTAINER.mp4,
            output: { format: "webm" },
            mode: "remux",
          }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /ffmpeg conversion failed with exit code \d+\./);
          assert.match(error.message, /supported for WebM/);
          return true;
        },
      );
    });
  });
});
