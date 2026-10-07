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
import { assertPixelColor, loadQuadrantPatternSample, QUADRANT_COLOURS } from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");
const COMBINATIONS = listSupportedOutputCombinations("mp4");

const EXPECTED_MIME_TYPE = "video/mp4";

/** The fixtures are 640x360, so this takes the top-left quarter. */
const REGION: CropRegion = { x: 0, y: 0, width: 320, height: 180 };

/**
 * Cropping always re-encodes, because the frame geometry changes, and it is one
 * of the few operations that lets the caller choose the output codecs.
 *
 * MP4 accepts cropping's defaults — H.264 video with AAC audio — so every
 * combination here is valid.
 */
describe("mp4 컨테이너 영상 크롭", () => {
  describe("지원 출력 조합별", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 크롭하면 320x180 이 된다`, async () => {
        const outcome = await cropSample({ sample: PINNED_SAMPLE, region: REGION, output: { videoCodec, audioCodec } });

        assertMediaOutput(outcome, {
          container: "mp4",
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
          container: "mp4",
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
        container: "mp4",
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
        container: "mp4",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "h264",
        audioCodec: null,
        width: 320,
        height: 180,
      });
    });
  });

  /**
   * Where the crop was taken from, which the codec-sample fixtures cannot show.
   *
   * Their picture is a single flat colour, so a crop at (0, 0) and a crop at
   * (320, 180) come out pixel-identical and a repository that ignored `x` and `y`
   * would pass either way. The quadrant pattern fixture gives each 320x180 region
   * a different colour, so the colours in the output name the region that was cut.
   *
   * Position has nothing to do with the container, so this lives in one file.
   */
  describe("자를 위치 — 패턴 픽스처로 좌표를 확인한다", () => {
    const PATTERN = loadQuadrantPatternSample();

    it("(0, 0) 에서 자르면 좌상단 사분면만 남는다", async () => {
      const frame = requireFrame(
        await cropSample({ sample: PATTERN, region: { x: 0, y: 0, width: 320, height: 180 }, captureFrame: true }),
      );

      for (const [x, y] of [
        [5, 5],
        [160, 90],
        [314, 174],
      ]) {
        assertPixelColor(frame.at(x, y), QUADRANT_COLOURS.topLeft, `(${x}, ${y}) must be the top-left quadrant`);
      }
    });

    it("(320, 180) 에서 자르면 우하단 사분면만 남는다", async () => {
      // The same size as the case above, from the opposite corner. If `x` and `y`
      // were ignored both would be red; this one has to be yellow.
      const frame = requireFrame(
        await cropSample({ sample: PATTERN, region: { x: 320, y: 180, width: 320, height: 180 }, captureFrame: true }),
      );

      for (const [x, y] of [
        [5, 5],
        [160, 90],
        [314, 174],
      ]) {
        assertPixelColor(frame.at(x, y), QUADRANT_COLOURS.bottomRight, `(${x}, ${y}) must be the bottom-right quadrant`);
      }
    });

    it("가운데에서 자르면 네 사분면이 한 조각씩 들어온다", async () => {
      // Cutting 320x180 from (160, 90) straddles the quadrant boundary, so each
      // corner of the output lands in a different quadrant. That pins both axes
      // at once: a wrong x or y would put the wrong colour in a corner.
      const frame = requireFrame(
        await cropSample({ sample: PATTERN, region: { x: 160, y: 90, width: 320, height: 180 }, captureFrame: true }),
      );

      assertPixelColor(frame.at(5, 5), QUADRANT_COLOURS.topLeft, "output top-left corner");
      assertPixelColor(frame.at(314, 5), QUADRANT_COLOURS.topRight, "output top-right corner");
      assertPixelColor(frame.at(5, 174), QUADRANT_COLOURS.bottomLeft, "output bottom-left corner");
      assertPixelColor(frame.at(314, 174), QUADRANT_COLOURS.bottomRight, "output bottom-right corner");
    });
  });
});

function requireFrame(outcome: MediaEditCaseOutcome) {
  assert.ok(outcome.frame, "the case must be run with captureFrame enabled");
  return outcome.frame;
}
