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

const COMBINATIONS = listSupportedOutputCombinations("mov");
const PINNED_SAMPLE = loadCodecSampleMatrix("mov").get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/quicktime";

const SOURCES_BY_CONTAINER: Record<VideoContainerFormat, CodecSampleVideo> = {
  mp4: loadCodecSampleMatrix("mp4").get("h264", "aac"),
  mov: PINNED_SAMPLE,
  webm: loadCodecSampleMatrix("webm").get("vp9", "opus"),
  mkv: loadCodecSampleMatrix("mkv").get("h264", "aac"),
};

/**
 * MOV is the narrowest valid output set after WebM: H.264 or H.265 video with
 * AAC or MP3 audio. Opus is excluded because QuickTime has no standard Opus
 * mapping, even though its MP4 sibling does.
 */
describe("mov 로 포맷 변환", () => {
  describe("지원 출력 조합별 트랜스코딩", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 변환된다`, async () => {
        const outcome = await runFormatConversionCase({
          sample: SOURCES_BY_CONTAINER.webm,
          output: { format: "mov", videoCodec, audioCodec },
        });

        assert.equal(outcome.plan.mode, "transcode");
        assertMediaOutput(outcome, {
          container: "mov",
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
      it(`${container} 소스를 mov/h264/aac 로 변환한다`, async () => {
        const outcome = await runFormatConversionCase({
          sample,
          output: { format: "mov", videoCodec: "h264", audioCodec: "aac" },
        });

        assertMediaOutput(outcome, {
          container: "mov",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: "aac",
          audible: true,
        });
      });
    }
  });

  describe("리먹싱", () => {
    it("mp4/h264/aac 를 mov 로 리먹싱한다", async () => {
      const outcome = await runFormatConversionCase({
        sample: SOURCES_BY_CONTAINER.mp4,
        output: { format: "mov" },
        mode: "remux",
      });

      assert.equal(outcome.plan.mode, "remux");
      assertMediaOutput(outcome, {
        container: "mov",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "h264",
        audioCodec: "aac",
        audible: true,
      });
    });
  });
});
