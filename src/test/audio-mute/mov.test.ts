import { describe, it } from "node:test";

import { assertMediaOutput, loadCodecSampleMatrix, muteSample, toProbeVideoCodecName } from "../support";

const MATRIX = loadCodecSampleMatrix("mov");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/quicktime";

/**
 * MOV accepts both muting paths: `-an` removes the stream, and segment muting
 * re-encodes to AAC, which MOV carries.
 *
 * ProRes sources matter for `muteAll`, since `-c:v copy` means a mute is a pure
 * remux and the intermediate-codec video is never touched.
 */
describe("mov 컨테이너 오디오 음소거", () => {
  describe("전체 음소거 (-an, 오디오 스트림 제거)", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스에서 오디오 스트림이 사라진다`, async () => {
        const outcome = await muteSample({ sample, muteAll: true });

        assertMediaOutput(outcome, {
          container: "mov",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: null,
          durationSeconds: 1,
        });
      });
    }
  });

  describe("구간 음소거 (오디오 스트림 유지 + aac 재인코딩)", () => {
    it("전체 구간을 음소거하면 무음 aac 스트림이 남는다", async () => {
      const outcome = await muteSample({ sample: PINNED_SAMPLE, segments: [{ startSeconds: 0, endSeconds: 1 }] });

      assertMediaOutput(outcome, {
        container: "mov",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: false,
        channels: 2,
        sampleRate: 48000,
      });
    });

    it("절반만 음소거하면 나머지 구간 소리가 남는다", async () => {
      const outcome = await muteSample({ sample: PINNED_SAMPLE, segments: [{ startSeconds: 0, endSeconds: 0.5 }] });

      assertMediaOutput(outcome, {
        container: "mov",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: true,
      });
    });

    it("구간이 비어 있으면 중립 필터가 적용되어 소리가 남는다", async () => {
      const outcome = await muteSample({ sample: PINNED_SAMPLE, segments: [] });

      assertMediaOutput(outcome, {
        container: "mov",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: true,
      });
    });
  });
});
