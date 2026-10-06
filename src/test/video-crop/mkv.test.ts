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

const MATRIX = loadCodecSampleMatrix("mkv");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");
const COMBINATIONS = listSupportedOutputCombinations("mkv");

const EXPECTED_MIME_TYPE = "video/x-matroska";

/** The fixtures are 640x360, so this takes the top-left quarter. */
const REGION: CropRegion = { x: 0, y: 0, width: 320, height: 180 };

/**
 * Cropping always re-encodes, because the frame geometry changes, and it is one
 * of the few operations that lets the caller choose the output codecs.
 *
 * Matroska takes every writable codec, so this is the full twelve-combination
 * sweep — the widest valid set of any container.
 */
describe("mkv 컨테이너 영상 크롭", () => {
  describe("지원 출력 조합별", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 크롭하면 320x180 이 된다`, async () => {
        const outcome = await cropSample({ sample: PINNED_SAMPLE, region: REGION, output: { videoCodec, audioCodec } });

        assertMediaOutput(outcome, {
          container: "mkv",
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

  describe("소스 코덱별 — 기본 출력 코덱(h264/aac) 로 크롭", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스가 h264/aac 로 재인코딩된다`, async () => {
        // The source codec does not survive: cropping has to re-encode, so an
        // AV1 or HEVC source still comes out as the requested output codec.
        const outcome = await cropSample({ sample, region: REGION });

        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: "aac",
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
        region: { x: 0, y: 0, width: 321, height: 181 },
      });

      assertMediaOutput(outcome, {
        container: "mkv",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "h264",
        audioCodec: "aac",
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
        output: { audioCodec: "none" },
      });

      assertMediaOutput(outcome, {
        container: "mkv",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "h264",
        audioCodec: null,
        width: 320,
        height: 180,
      });
    });
  });

  describe("AV1 출력 요청은 거부된다", () => {
    it("videoCodec 을 av1 으로 주면 지원 목록을 알려주며 예외가 발생한다", async () => {
      // Matroska would hold AV1 happily, so the refusal comes from the library's
      // own output policy rather than from the container.
      await assert.rejects(
        () => cropSample({ sample: PINNED_SAMPLE, region: REGION, output: { videoCodec: "av1" } }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /av1 video output is not supported/);
          assert.match(error.message, /h264, h265, vp8, vp9/);
          return true;
        },
      );
    });
  });

  describe("현재 동작 기록: output.format 은 실제 출력 컨테이너를 바꾸지 않는다", () => {
    it("format 을 mp4 로 줘도 파일은 mkv 이고 MIME 만 mp4 가 된다", async () => {
      // The output *path* comes from the input file name's extension, while the
      // reported MIME type honours `output.format`. Asking for a different
      // container therefore yields an MKV file labelled as MP4 — the two
      // disagree, and the label is the one that is wrong. `video-aspect-ratio`
      // gets this right by deriving the path from `output.format`.
      const outcome = await cropSample({ sample: PINNED_SAMPLE, region: REGION, output: { format: "mp4" } });

      assert.equal(outcome.profile.container, "mkv", "the real file stays Matroska");
      assert.equal(outcome.resultMimeType, "video/mp4", "but the reported MIME type claims MP4");
      assert.match(outcome.resultFileName, /\.mkv$/);
    });
  });
});

function requireFrame(outcome: MediaEditCaseOutcome) {
  assert.ok(outcome.frame, "the case must be run with captureFrame enabled");
  return outcome.frame;
}
