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

const COMBINATIONS = listSupportedOutputCombinations("mp4");
const PINNED_SAMPLE = loadCodecSampleMatrix("mp4").get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/mp4";

/** One representative source per container, to sweep inputs without the full matrix. */
const SOURCES_BY_CONTAINER: Record<VideoContainerFormat, CodecSampleVideo> = {
  mp4: PINNED_SAMPLE,
  mov: loadCodecSampleMatrix("mov").get("h264", "aac"),
  webm: loadCodecSampleMatrix("webm").get("vp9", "opus"),
  mkv: loadCodecSampleMatrix("mkv").get("h264", "aac"),
};

/**
 * Format conversion is the only operation that already consults the container
 * before choosing codecs — `CodecCompatibilityRepository` holds a per-container
 * default table, which is why this operation has no WebM defect.
 *
 * It has two modes. `remux` rewrites the container with `-c copy` and keeps the
 * original codecs, so it is fast and lossless but fails if the target container
 * will not hold them. `transcode` re-encodes to the requested codecs.
 */
describe("mp4 로 포맷 변환", () => {
  describe("지원 출력 조합별 트랜스코딩", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 변환된다`, async () => {
        const outcome = await runFormatConversionCase({
          sample: SOURCES_BY_CONTAINER.webm,
          output: { format: "mp4", videoCodec, audioCodec },
        });

        assert.equal(outcome.plan.mode, "transcode", "requesting codecs selects transcode mode");
        assertMediaOutput(outcome, {
          container: "mp4",
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
      it(`${container} 소스를 mp4/h264/aac 로 변환한다`, async () => {
        const outcome = await runFormatConversionCase({
          sample,
          output: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
        });

        assertMediaOutput(outcome, {
          container: "mp4",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: "aac",
          audible: true,
        });
      });
    }
  });

  describe("리먹싱 (코덱 유지)", () => {
    it("mov/h264/aac 를 mp4 로 리먹싱한다", async () => {
      // MOV and MP4 are both ISO BMFF and accept the same codecs here, so the
      // streams move across untouched and nothing is re-encoded.
      const outcome = await runFormatConversionCase({
        sample: SOURCES_BY_CONTAINER.mov,
        output: { format: "mp4" },
        mode: "remux",
      });

      assert.equal(outcome.plan.mode, "remux");
      assert.equal(outcome.plan.output.videoCodec, "copy");
      assert.equal(outcome.plan.output.audioCodec, "copy");
      assertMediaOutput(outcome, {
        container: "mp4",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "h264",
        audioCodec: "aac",
        audible: true,
      });
    });

    it("코덱을 지정하지 않으면 자동으로 리먹싱이 선택된다", async () => {
      const outcome = await runFormatConversionCase({
        sample: SOURCES_BY_CONTAINER.mov,
        output: { format: "mp4" },
      });

      assert.equal(outcome.plan.mode, "remux", "nothing was asked to change but the container");
    });
  });
});
