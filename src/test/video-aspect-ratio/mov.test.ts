import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type VideoAspectRatio } from "../../index";
import {
  assertMediaOutput,
  loadCodecSampleMatrix,
  runAspectRatioCase,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mov");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");
const COMBINATIONS = listSupportedOutputCombinations("mov");

const EXPECTED_MIME_TYPE = "video/quicktime";

const RATIO_FRAMES: { aspectRatio: VideoAspectRatio; width: number; height: number }[] = [
  { aspectRatio: "9:16", width: 640, height: 1138 },
  { aspectRatio: "16:9", width: 640, height: 360 },
  { aspectRatio: "1:1", width: 640, height: 640 },
  { aspectRatio: "4:3", width: 640, height: 480 },
];

/**
 * MOV aspect-ratio transforms are valid across the board.
 *
 * The ProRes and PCM sources necessarily lose their codecs: the operation
 * re-encodes the video to pad it, and the output profile only offers H.264 or
 * H.265 video with AAC or MP3 audio.
 */
describe("mov 컨테이너 화면비 변환", () => {
  describe("비율별 출력 프레임", () => {
    for (const { aspectRatio, width, height } of RATIO_FRAMES) {
      it(`${aspectRatio} 로 변환하면 ${width}x${height} 가 된다`, async () => {
        const outcome = await runAspectRatioCase({
          sample: PINNED_SAMPLE,
          aspectRatio,
          output: { format: "mov", videoCodec: "h264", audioCodec: "aac" },
        });

        assertMediaOutput(outcome, {
          container: "mov",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: "aac",
          audible: true,
          width,
          height,
        });
      });
    }
  });

  describe("지원 출력 조합별", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 변환된다`, async () => {
        const outcome = await runAspectRatioCase({
          sample: PINNED_SAMPLE,
          aspectRatio: "16:9",
          output: { format: "mov", videoCodec, audioCodec },
        });

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

  describe("소스 코덱별", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스가 1:1 로 변환된다`, async () => {
        const outcome = await runAspectRatioCase({
          sample,
          aspectRatio: "1:1",
          output: { format: "mov", videoCodec: "h264", audioCodec: "aac" },
        });

        assertMediaOutput(outcome, {
          container: "mov",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: "aac",
          audible: true,
          width: 640,
          height: 640,
        });
      });
    }
  });
});
