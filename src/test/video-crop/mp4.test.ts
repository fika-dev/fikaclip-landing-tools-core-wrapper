import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type CropRegion } from "../../index";
import {
  assertMediaOutput,
  cropSample,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");
const COMBINATIONS = listSupportedOutputCombinations("mp4");

const EXPECTED_MIME_TYPE = "video/mp4";

/** The fixtures are 640x360, so this takes the top-left quarter. */
const REGION: CropRegion = { x: 0, y: 0, width: 320, height: 180 };

/**
 * Cropping always re-encodes the video, because the frame geometry changes.
 *
 * Its defaults are H.264 video and AAC audio, chosen without consulting the
 * output container — which happens to be correct for MP4, so every combination
 * here is valid.
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

  describe("기본 출력 코덱 (h264/aac) 으로 소스별 크롭", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스가 h264/aac 로 재인코딩된다`, async () => {
        // The source video codec is irrelevant to the output here: cropping has
        // to re-encode, so an AV1 or HEVC source still comes out as H.264.
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

  describe("홀수 크기는 짝수로 내림된다", () => {
    it("321x181 을 요청하면 320x180 이 된다", async () => {
      // Chroma subsampling in yuv420p stores one chroma sample per 2x2 block, so
      // odd dimensions have no valid representation and the repository rounds
      // every crop value down to even.
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
});
