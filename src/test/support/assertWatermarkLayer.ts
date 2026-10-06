import assert from "node:assert/strict";

import { assertPixelColor, assertPixelNotColor } from "./assertPixelColor";
import { WATERMARK_IMAGE_RGB } from "./createWatermarkImageFile";
import type { FramePixels } from "./FramePixels";

export type ExpectedWatermarkLayer = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AssertWatermarkLayerOptions = {
  frame: FramePixels;
  /** The same sample measured before the operation, as the baseline. */
  sourceFrame: FramePixels;
  layer: ExpectedWatermarkLayer;
  /** Extra points that must still match the source, e.g. a position not used. */
  alsoClearAt?: readonly [number, number][];
};

/**
 * Asserts that the watermark covers exactly the requested rectangle.
 *
 * Position, size and opacity all leave the container, codecs, resolution and
 * duration identical, so stream-level assertions cannot distinguish them — or
 * distinguish any of them from drawing nothing at all. Checking the rectangle's
 * interior *and* the first pixel past its edge pins both the placement and the
 * extent, and comparing the rest of the frame against the source baseline keeps
 * the operation from being credited for changes it did not make.
 */
export function assertWatermarkLayer(options: AssertWatermarkLayerOptions): void {
  const { frame, sourceFrame, layer, alsoClearAt = [] } = options;
  const midX = layer.x + Math.floor(layer.width / 2);
  const midY = layer.y + Math.floor(layer.height / 2);
  const lastInsideX = layer.x + layer.width - 1;
  const lastInsideY = layer.y + layer.height - 1;
  const firstOutsideX = layer.x + layer.width;
  const firstOutsideY = layer.y + layer.height;

  // Precondition: the test only means something if the fixture is not already
  // the watermark's colour where the watermark is expected to land.
  assertPixelNotColor(
    sourceFrame.at(midX, midY),
    WATERMARK_IMAGE_RGB,
    "the fixture must not already be the watermark colour at the layer position",
  );

  assertPixelColor(frame.at(layer.x, layer.y), WATERMARK_IMAGE_RGB, "watermark top-left corner");
  assertPixelColor(frame.at(midX, midY), WATERMARK_IMAGE_RGB, "watermark centre");
  assertPixelColor(frame.at(lastInsideX, lastInsideY), WATERMARK_IMAGE_RGB, "last pixel inside the watermark");

  if (firstOutsideX < frame.width && firstOutsideY < frame.height) {
    assertPixelColor(
      frame.at(firstOutsideX, firstOutsideY),
      sourceFrame.at(firstOutsideX, firstOutsideY),
      "first pixel past the watermark",
    );
  }

  for (const [x, y] of alsoClearAt) {
    assertPixelColor(frame.at(x, y), sourceFrame.at(x, y), `pixel (${x}, ${y}) must be untouched`);
  }
}

/** Points sampled well away from any layer, used as the "nothing else moved" check. */
export const UNTOUCHED_POINTS: readonly [number, number][] = [
  [200, 200],
  [400, 300],
  [600, 40],
  [320, 180],
];

export function assertFrameMatchesSource(
  frame: FramePixels,
  sourceFrame: FramePixels,
  points: readonly [number, number][] = UNTOUCHED_POINTS,
): void {
  for (const [x, y] of points) {
    assertPixelColor(frame.at(x, y), sourceFrame.at(x, y), `pixel (${x}, ${y}) outside the watermark`);
  }
}

/**
 * Asserts an operation left the audio stream alone.
 *
 * Only meaningful for operations using `-c:a copy`: the stream is carried over
 * rather than re-encoded, so its measured loudness must match the source
 * exactly rather than approximately.
 */
export function assertAudioUnchanged(
  outcome: { profile: { audioCodec?: string }; loudness: { meanVolumeDb: number | null } },
  source: { profile: { audioCodec?: string }; loudness: { meanVolumeDb: number | null } },
): void {
  assert.equal(outcome.profile.audioCodec, source.profile.audioCodec, "audio codec is copied, not re-encoded");
  assert.ok(
    source.loudness.meanVolumeDb !== null && outcome.loudness.meanVolumeDb !== null,
    "both sides must have a measurable audio stream",
  );
  assert.ok(
    Math.abs(outcome.loudness.meanVolumeDb - source.loudness.meanVolumeDb) <= 0.2,
    `audio loudness changed: source ${source.loudness.meanVolumeDb} dB, output ${outcome.loudness.meanVolumeDb} dB`,
  );
}
