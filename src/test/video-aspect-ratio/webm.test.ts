import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type VideoAspectRatio } from "../../index";
import {
  assertMediaOutput,
  loadCodecSampleMatrix,
  runAspectRatioCase,
  toProbeVideoCodecName,
} from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");
const COMBINATIONS = listSupportedOutputCombinations("webm");

const EXPECTED_MIME_TYPE = "video/webm";

const RATIO_FRAMES: { aspectRatio: VideoAspectRatio; width: number; height: number }[] = [
  { aspectRatio: "9:16", width: 640, height: 1138 },
  { aspectRatio: "16:9", width: 640, height: 360 },
  { aspectRatio: "1:1", width: 640, height: 640 },
  { aspectRatio: "4:3", width: 640, height: 480 },
];

/**
 * WebM aspect-ratio transforms are fully valid, because this operation takes the
 * output codecs as required arguments rather than hardcoding them.
 *
 * That is the same reason WebM cropping works once codecs are passed, and it is
 * the shape the audio operations are missing.
 *
 * One wrinkle: the repository always passes `-preset veryfast`, which is a
 * private option of the x264/x265 encoders. libvpx has no `preset`, so ffmpeg
 * emits an "option not used for any stream" warning — a warning, not an error,
 * so the transform still succeeds.
 */
describe("webm 컨테이너 화면비 변환", () => {
  describe("비율별 출력 프레임", () => {
    for (const { aspectRatio, width, height } of RATIO_FRAMES) {
      it(`${aspectRatio} 로 변환하면 ${width}x${height} 가 된다`, async () => {
        const outcome = await runAspectRatioCase({
          sample: PINNED_SAMPLE,
          aspectRatio,
          output: { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
        });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "vp9",
          audioCodec: "opus",
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
          output: { format: "webm", videoCodec, audioCodec },
        });

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

  describe("소스 코덱별", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스가 1:1 로 변환된다`, async () => {
        // AV1 and Vorbis sources decode normally even though neither can be
        // written back out.
        const outcome = await runAspectRatioCase({
          sample,
          aspectRatio: "1:1",
          output: { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
        });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "vp9",
          audioCodec: "opus",
          audible: true,
          width: 640,
          height: 640,
        });
      });
    }
  });
});
