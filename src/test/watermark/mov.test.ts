import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  assertAudioUnchanged,
  assertFrameMatchesSource,
  assertMediaOutput,
  assertPixelColor,
  assertPixelNotColor,
  assertWatermarkLayer,
  blendRgb,
  loadCodecSampleMatrix,
  measureSample,
  toProbeAudioCodecName,
  WATERMARK_IMAGE_RGB,
  watermarkSample,
  type MediaEditCaseOutcome,
  type SampleMeasurement,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mov");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/quicktime";

/** `watermarkSample` defaults, which the geometry assertions depend on. */
const DEFAULT_LAYER = { x: 8, y: 8, width: 64, height: 64 };

/**
 * Watermarking is the mirror image of add-audio: it re-encodes the video with
 * `-c:v libx264` and copies the audio with `-c:a copy`. Neither is configurable,
 * so the valid containers are exactly "those that accept H.264 plus whatever
 * audio the source already had".
 *
 * MOV is where `-c:a copy` pays off most: the PCM sources keep their
 * uncompressed audio because the audio stream is never touched. The ProRes
 * sources show the other side of the same coin — their video is re-encoded to
 * H.264 and the intermediate codec is lost, with no way to ask for anything else.
 *
 * The layer options need pixels to verify, because position, size and opacity
 * all leave the container, codecs, resolution and duration identical.
 */
describe("mov 컨테이너 워터마크", () => {
  /**
   * Two independent claims, so two single-axis sweeps rather than the full
   * product: `-c:a copy` must preserve whatever audio came in, and `-c:v libx264`
   * must replace whatever video came in. Crossing the axes would re-test each
   * audio codec once per video codec without checking anything new.
   */
  describe("오디오 코덱 축 — -c:a copy 로 소스 코덱이 유지된다", () => {
    for (const sample of MATRIX.withVideo("h264")) {
      it(`${sample.audioCodec} 오디오가 재인코딩 없이 그대로 남는다`, async () => {
        const outcome = await watermarkSample({ sample });

        assertMediaOutput(outcome, {
          container: "mov",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: toProbeAudioCodecName(sample.audioCodec),
          audible: true,
          // Overlaying does not change the frame geometry.
          width: 640,
          height: 360,
        });
      });
    }
  });

  describe("비디오 코덱 축 — 무엇이 들어와도 h264 로 재인코딩된다", () => {
    for (const sample of MATRIX.withAudio("aac")) {
      it(`${sample.videoCodec} 영상이 h264 로 바뀐다`, async () => {
        const outcome = await watermarkSample({ sample });

        assertMediaOutput(outcome, {
          container: "mov",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: toProbeAudioCodecName("aac"),
          audible: true,
          width: 640,
          height: 360,
        });
      });
    }
  });

  describe("레이어 옵션별 — 실제 픽셀로 검증", () => {
    let source: SampleMeasurement;

    before(async () => {
      source = await measureSample(PINNED_SAMPLE);
    });

    it("기본 위치와 크기로 그려진다", async () => {
      const frame = requireFrame(await watermarkSample({ sample: PINNED_SAMPLE, captureFrame: true }));

      assertWatermarkLayer({ frame, sourceFrame: source.frame, layer: DEFAULT_LAYER });
    });

    it("위치를 지정하면 그 위치에만 그려진다", async () => {
      const x = 100;
      const y = 50;
      const frame = requireFrame(await watermarkSample({ sample: PINNED_SAMPLE, x, y, captureFrame: true }));

      assertWatermarkLayer({
        frame,
        sourceFrame: source.frame,
        layer: { x, y, width: DEFAULT_LAYER.width, height: DEFAULT_LAYER.height },
        // The default position must now be clear — this is what distinguishes a
        // real placement from the default one.
        alsoClearAt: [[DEFAULT_LAYER.x, DEFAULT_LAYER.y]],
      });
    });

    it("크기를 지정하면 그 크기만큼만 그려진다", async () => {
      const size = 32;
      const frame = requireFrame(
        await watermarkSample({ sample: PINNED_SAMPLE, width: size, height: size, captureFrame: true }),
      );

      assertWatermarkLayer({
        frame,
        sourceFrame: source.frame,
        layer: { x: DEFAULT_LAYER.x, y: DEFAULT_LAYER.y, width: size, height: size },
        // At the default 64x64 this pixel would be covered, so it pins the scale.
        alsoClearAt: [[DEFAULT_LAYER.x + DEFAULT_LAYER.width - 8, DEFAULT_LAYER.y + DEFAULT_LAYER.height - 8]],
      });
    });

    it("워터마크 바깥 화면과 오디오는 변하지 않는다", async () => {
      const outcome = await watermarkSample({ sample: PINNED_SAMPLE, captureFrame: true });

      assertFrameMatchesSource(requireFrame(outcome), source.frame);
      assertAudioUnchanged(outcome, source);
    });

    describe("현재 동작 기록: 투명도가 적용되지 않는다", () => {
      it("opacity 0.5 를 줘도 불투명하게 그려진다", async () => {
        // The watermark image is RGB with no alpha channel, and the filter chain
        // runs `colorchannelmixer=aa=<opacity>` *before* `format=rgba`. Scaling a
        // channel that does not exist yet does nothing, and `format=rgba` then
        // adds a fully opaque alpha. Swapping the two stages fixes it: with
        // `format=rgba` first, this pixel becomes the expected blend.
        const frame = requireFrame(
          await watermarkSample({ sample: PINNED_SAMPLE, opacity: 0.5, captureFrame: true }),
        );
        const expectedBlend = blendRgb(source.frame.at(20, 20), WATERMARK_IMAGE_RGB, 0.5);

        assertPixelColor(frame.at(20, 20), WATERMARK_IMAGE_RGB, "opacity is currently ignored");
        assertPixelNotColor(frame.at(20, 20), expectedBlend, "the 50% blend that should have been drawn");
      });

      it("opacity 0 을 줘도 워터마크가 그대로 보인다", async () => {
        // The clearest form of the defect: fully transparent should leave the
        // frame untouched, and instead it paints the watermark at full strength.
        const frame = requireFrame(await watermarkSample({ sample: PINNED_SAMPLE, opacity: 0, captureFrame: true }));

        assertPixelColor(frame.at(20, 20), WATERMARK_IMAGE_RGB, "a fully transparent watermark is still painted");
        assertPixelNotColor(frame.at(20, 20), source.frame.at(20, 20), "the frame should have been left untouched");
      });
    });
  });
});

function requireFrame(outcome: MediaEditCaseOutcome) {
  assert.ok(outcome.frame, "the case must be run with captureFrame enabled");
  return outcome.frame;
}
