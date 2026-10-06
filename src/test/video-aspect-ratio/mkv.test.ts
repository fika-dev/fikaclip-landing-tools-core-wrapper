import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  OUTPUT_AUDIO_CODECS,
  OUTPUT_VIDEO_CODECS,
  type OutputAudioCodec,
  type OutputVideoCodec,
  type VideoAspectRatio,
} from "../../index";
import {
  assertAspectRatioFrame,
  assertMediaOutput,
  loadCodecSampleMatrix,
  measureSample,
  runAspectRatioCase,
  toProbeAudioCodecName,
  toProbeVideoCodecName,
  type AspectRatioCaseOutcome,
  type CodecSampleVideo,
  type SampleMeasurement,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mkv");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/x-matroska";

/**
 * Target frames for the fixtures' 640x360 picture.
 *
 * The transform pads; it never scales. It keeps the source's own aspect ratio,
 * fills the longer dimension of the target frame first, centres the picture and
 * fills what is left with black.
 *
 * `width  = ceil(max(iw, ih × target) / 2) × 2`
 * `height = ceil(max(ih, iw ÷ target) / 2) × 2`
 *
 * Rounding to even numbers is for yuv420p, which stores one chroma sample per
 * 2x2 block and so cannot represent an odd size.
 */
const RATIO_FRAMES: { aspectRatio: VideoAspectRatio; width: number; height: number }[] = [
  // 360 × 16/9 = 640, so the width already fits and only the height grows.
  { aspectRatio: "9:16", width: 640, height: 1138 },
  // The source is already 16:9, so nothing is padded.
  { aspectRatio: "16:9", width: 640, height: 360 },
  { aspectRatio: "1:1", width: 640, height: 640 },
  { aspectRatio: "4:3", width: 640, height: 480 },
];

/** Codecs the library can write, and therefore the ones a transform can keep. */
const canKeepCodecs = (sample: CodecSampleVideo) =>
  (OUTPUT_VIDEO_CODECS as readonly string[]).includes(sample.videoCodec) &&
  (OUTPUT_AUDIO_CODECS as readonly string[]).includes(sample.audioCodec);

const CODEC_KEEPING_SAMPLES = MATRIX.all.filter(canKeepCodecs);
const CODEC_LOSING_SAMPLES = MATRIX.all.filter((sample) => !canKeepCodecs(sample));

/** `canKeepCodecs` already established these are writable names. */
const sameProfileAs = (sample: CodecSampleVideo) => ({
  format: MATRIX.container,
  videoCodec: sample.videoCodec as OutputVideoCodec,
  audioCodec: sample.audioCodec as OutputAudioCodec,
});

const FALLBACK_PROFILE = {
  format: MATRIX.container,
  videoCodec: "h264" as OutputVideoCodec,
  audioCodec: "aac" as OutputAudioCodec,
};

/**
 * Aspect-ratio transforms, with the container and codecs held fixed so that the
 * frame geometry is the only thing changing. Converting between formats is a
 * separate operation with its own tests.
 *
 * Matroska keeps the widest set — H.264, H.265 and VP9 with AAC or Opus. FLAC
 * audio and AV1 video are the exceptions, for the same reason as elsewhere:
 * neither can be encoded.
 */
describe("mkv 컨테이너 화면비 변환", () => {
  const measurements = new Map<string, SampleMeasurement>();

  before(async () => {
    // The padding check compares against the source's own picture size, so every
    // sample this file transforms is measured first.
    for (const sample of MATRIX.all) {
      measurements.set(sample.fileName, await measureSample(sample));
    }
  });

  const sourceOf = (sample: CodecSampleVideo) => {
    const measurement = measurements.get(sample.fileName);
    assert.ok(measurement, `missing a measurement for ${sample.fileName}`);
    return measurement;
  };

  const frameOf = (outcome: AspectRatioCaseOutcome) => {
    assert.ok(outcome.frame, "the aspect-ratio case must capture a frame");
    return outcome.frame;
  };

  describe("비율별 — 코덱과 컨테이너는 그대로, 프레임만 바뀐다", () => {
    for (const { aspectRatio, width, height } of RATIO_FRAMES) {
      it(`${aspectRatio} 로 바꾸면 ${width}x${height} 가 되고 원본 코덱이 유지된다`, async () => {
        const source = sourceOf(PINNED_SAMPLE);
        const outcome = await runAspectRatioCase({
          sample: PINNED_SAMPLE,
          aspectRatio,
          output: sameProfileAs(PINNED_SAMPLE),
        });

        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
          audioCodec: toProbeAudioCodecName(PINNED_SAMPLE.audioCodec),
          audible: true,
          width,
          height,
          durationSeconds: 1,
        });
        // Frame size alone cannot tell padding from stretching — the picture has
        // to still measure 640x360 and sit in the middle.
        assertAspectRatioFrame({ frame: frameOf(outcome), sourceFrame: source.frame, expected: { width, height } });
      });
    }
  });

  describe("소스 코덱별 — 코덱을 유지한 채 1:1 로 바꾼다", () => {
    for (const sample of CODEC_KEEPING_SAMPLES) {
      it(`${sample.videoCodec}/${sample.audioCodec} 가 그대로 유지된다`, async () => {
        const source = sourceOf(sample);
        const outcome = await runAspectRatioCase({ sample, aspectRatio: "1:1", output: sameProfileAs(sample) });

        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: toProbeAudioCodecName(sample.audioCodec),
          audible: true,
          width: 640,
          height: 640,
        });
        assertAspectRatioFrame({
          frame: frameOf(outcome),
          sourceFrame: source.frame,
          expected: { width: 640, height: 640 },
        });
      });
    }
  });

  describe("현재 한계: 인코딩할 수 없는 코덱은 유지되지 않는다", () => {
    for (const sample of CODEC_LOSING_SAMPLES) {
      it(`${sample.videoCodec}/${sample.audioCodec} 는 h264/aac 로 바뀐다`, async () => {
        // Padding re-encodes the frame, so the output codec has to be one the
        // library can write. These sources name a codec it cannot, so asking to
        // keep them is not expressible and the profile has to change.
        const source = sourceOf(sample);
        const outcome = await runAspectRatioCase({ sample, aspectRatio: "1:1", output: FALLBACK_PROFILE });

        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName("h264"),
          audioCodec: "aac",
          audible: true,
          width: 640,
          height: 640,
        });
        assertAspectRatioFrame({
          frame: frameOf(outcome),
          sourceFrame: source.frame,
          expected: { width: 640, height: 640 },
        });
        // The geometry is right, but the codec profile is not the source's.
        assert.notEqual(
          `${outcome.profile.videoCodec}/${outcome.profile.audioCodec}`,
          `${toProbeVideoCodecName(sample.videoCodec)}/${toProbeAudioCodecName(sample.audioCodec)}`,
          "this source was expected to lose its codec profile",
        );
      });
    }
  });

  describe("출력 제약", () => {
    it("비디오 코덱 copy 는 거부된다", async () => {
      // Padding changes the frame, so the video must be re-encoded; a stream copy
      // cannot express that and the repository refuses it up front.
      await assert.rejects(
        () =>
          runAspectRatioCase({
            sample: PINNED_SAMPLE,
            aspectRatio: "1:1",
            // @ts-expect-error -- `copy` is deliberately outside OutputVideoCodec
            output: { ...sameProfileAs(PINNED_SAMPLE), videoCodec: "copy" },
          }),
        /padding cannot be used with video copy/,
      );
    });

    it("오디오를 none 으로 주면 소리 없이 비율만 바뀐다", async () => {
      const source = sourceOf(PINNED_SAMPLE);
      const outcome = await runAspectRatioCase({
        sample: PINNED_SAMPLE,
        aspectRatio: "1:1",
        output: { ...sameProfileAs(PINNED_SAMPLE), audioCodec: "none" },
      });

      assertMediaOutput(outcome, {
        container: "mkv",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: null,
        width: 640,
        height: 640,
      });
      assertAspectRatioFrame({
        frame: frameOf(outcome),
        sourceFrame: source.frame,
        expected: { width: 640, height: 640 },
      });
    });
  });
});
