import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type VideoAspectRatio } from "../../index";
import {
  assertMediaOutput,
  loadCodecSampleMatrix,
  runAspectRatioCase,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");
const COMBINATIONS = listSupportedOutputCombinations("mp4");
const [DEFAULT_COMBINATION] = COMBINATIONS;

const EXPECTED_MIME_TYPE = "video/mp4";

/**
 * Target frames for a 640x360 source.
 *
 * The transform pads rather than crops: it keeps the source's own aspect ratio,
 * fills the longer dimension of the target frame first, centres the picture and
 * fills the rest with black. So the source is never scaled down and the output
 * grows instead.
 *
 * `width  = ceil(max(iw, ih × target) / 2) × 2`
 * `height = ceil(max(ih, iw ÷ target) / 2) × 2`
 *
 * The rounding to even numbers is for yuv420p chroma subsampling, which stores
 * one chroma sample per 2x2 block and so has no way to represent odd sizes.
 */
const RATIO_FRAMES: { aspectRatio: VideoAspectRatio; width: number; height: number }[] = [
  // 360 × 16/9 = 640, so the width already fits and only the height grows.
  { aspectRatio: "9:16", width: 640, height: 1138 },
  // The source is already 16:9, so nothing is padded.
  { aspectRatio: "16:9", width: 640, height: 360 },
  { aspectRatio: "1:1", width: 640, height: 640 },
  { aspectRatio: "4:3", width: 640, height: 480 },
];

describe("mp4 컨테이너 화면비 변환", () => {
  describe("비율별 출력 프레임", () => {
    for (const { aspectRatio, width, height } of RATIO_FRAMES) {
      it(`${aspectRatio} 로 변환하면 ${width}x${height} 가 된다`, async () => {
        const outcome = await runAspectRatioCase({
          sample: PINNED_SAMPLE,
          aspectRatio,
          output: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
        });

        assertMediaOutput(outcome, {
          container: "mp4",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: "aac",
          audible: true,
          width,
          height,
          durationSeconds: 1,
        });
      });
    }
  });

  describe("지원 출력 조합별", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 변환된다`, async () => {
        // 16:9 keeps the frame at 640x360, so this sweep isolates the codec
        // choice from the padding geometry.
        const outcome = await runAspectRatioCase({
          sample: PINNED_SAMPLE,
          aspectRatio: "16:9",
          output: { format: "mp4", videoCodec, audioCodec },
        });

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

  describe("소스 코덱별", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스가 1:1 로 변환된다`, async () => {
        const outcome = await runAspectRatioCase({
          sample,
          aspectRatio: "1:1",
          output: { format: "mp4", videoCodec: DEFAULT_COMBINATION.videoCodec, audioCodec: DEFAULT_COMBINATION.audioCodec },
        });

        assertMediaOutput(outcome, {
          container: "mp4",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(DEFAULT_COMBINATION.videoCodec),
          audioCodec: DEFAULT_COMBINATION.audioCodec,
          audible: true,
          width: 640,
          height: 640,
        });
      });
    }
  });

  describe("출력 제약", () => {
    it("비디오 코덱 copy 는 거부된다", async () => {
      // Padding changes the frame, so the video has to be re-encoded; a stream
      // copy cannot express that and the repository rejects it up front.
      await assert.rejects(
        () =>
          runAspectRatioCase({
            sample: PINNED_SAMPLE,
            aspectRatio: "1:1",
            // @ts-expect-error -- `copy` is deliberately outside OutputVideoCodec
            output: { format: "mp4", videoCodec: "copy", audioCodec: "aac" },
          }),
        /padding cannot be used with video copy/,
      );
    });

    it("오디오를 none 으로 주면 오디오 스트림이 사라진다", async () => {
      const outcome = await runAspectRatioCase({
        sample: PINNED_SAMPLE,
        aspectRatio: "1:1",
        output: { format: "mp4", videoCodec: "h264", audioCodec: "none" },
      });

      assertMediaOutput(outcome, {
        container: "mp4",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: "h264",
        audioCodec: null,
        width: 640,
        height: 640,
      });
    });

    it("AV1 출력 요청은 거부된다", async () => {
      await assert.rejects(
        () =>
          runAspectRatioCase({
            sample: PINNED_SAMPLE,
            aspectRatio: "1:1",
            // @ts-expect-error -- `av1` is deliberately outside OutputVideoCodec
            output: { format: "mp4", videoCodec: "av1", audioCodec: "aac" },
          }),
        /av1 video output is not supported/,
      );
    });
  });

  describe("출력 컨테이너를 바꿀 수 있다", () => {
    it("mp4 소스를 webm/vp9/opus 로 변환한다", async () => {
      // Unlike cropping, this operation derives the output path from
      // `output.format`, so a cross-container transform really does produce the
      // requested container.
      const outcome = await runAspectRatioCase({
        sample: PINNED_SAMPLE,
        aspectRatio: "1:1",
        output: { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
      });

      assertMediaOutput(outcome, {
        container: "webm",
        mimeType: "video/webm",
        videoCodec: "vp9",
        audioCodec: "opus",
        audible: true,
        width: 640,
        height: 640,
      });
    });
  });
});
