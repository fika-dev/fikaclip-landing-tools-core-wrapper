import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type CropRegion } from "../../index";
import {
  assertMediaOutput,
  cropSample,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mov");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");
const COMBINATIONS = listSupportedOutputCombinations("mov");

const EXPECTED_MIME_TYPE = "video/quicktime";

const REGION: CropRegion = { x: 0, y: 0, width: 320, height: 180 };

/**
 * MOV cropping accepts the defaults, so every combination is valid.
 *
 * The ProRes sources show the real cost of this operation: cropping re-encodes,
 * and ProRes is not a writable output codec, so an intermediate-codec source
 * comes back as H.264 with no way to ask for anything closer to the original.
 */
describe("mov 컨테이너 영상 크롭", () => {
  describe("지원 출력 조합별", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 크롭하면 320x180 이 된다`, async () => {
        const outcome = await cropSample({ sample: PINNED_SAMPLE, region: REGION, output: { videoCodec, audioCodec } });

        assertMediaOutput(outcome, {
          container: "mov",
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
        const outcome = await cropSample({ sample, region: REGION });

        assertMediaOutput(outcome, {
          container: "mov",
          mimeType: EXPECTED_MIME_TYPE,
          // ProRes and PCM are both lost here — neither is a writable output.
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
      const outcome = await cropSample({ sample: PINNED_SAMPLE, region: REGION, output: { audioCodec: "none" } });

      assertMediaOutput(outcome, {
        container: "mov",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "h264",
        audioCodec: null,
        width: 320,
        height: 180,
      });
    });
  });
});
