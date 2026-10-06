import assert from "node:assert/strict";

import type { Rgb } from "./FramePixels";

/**
 * Lossy video coding does not round-trip a colour exactly — a flat 255 red comes
 * back as 254 after an H.264 pass, and chroma subsampling shifts it further near
 * edges. The sampled points are well inside flat regions, so a small tolerance
 * is enough to tell colours apart without being brittle.
 */
const DEFAULT_TOLERANCE = 12;

function describeRgb(color: Rgb): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function isApproximatelyRgb(actual: Rgb, expected: Rgb, tolerance = DEFAULT_TOLERANCE): boolean {
  return (
    Math.abs(actual.r - expected.r) <= tolerance &&
    Math.abs(actual.g - expected.g) <= tolerance &&
    Math.abs(actual.b - expected.b) <= tolerance
  );
}

export function assertPixelColor(actual: Rgb, expected: Rgb, label: string, tolerance = DEFAULT_TOLERANCE): void {
  assert.ok(
    isApproximatelyRgb(actual, expected, tolerance),
    `${label}: expected ~${describeRgb(expected)}, received ${describeRgb(actual)}`,
  );
}

export function assertPixelNotColor(actual: Rgb, unexpected: Rgb, label: string, tolerance = DEFAULT_TOLERANCE): void {
  assert.ok(
    !isApproximatelyRgb(actual, unexpected, tolerance),
    `${label}: expected a colour other than ~${describeRgb(unexpected)}, received ${describeRgb(actual)}`,
  );
}

/** Blends `overlay` onto `base` at the given alpha, the way `overlay` composites. */
export function blendRgb(base: Rgb, overlay: Rgb, alpha: number): Rgb {
  const mix = (baseChannel: number, overlayChannel: number) =>
    Math.round(baseChannel * (1 - alpha) + overlayChannel * alpha);

  return { r: mix(base.r, overlay.r), g: mix(base.g, overlay.g), b: mix(base.b, overlay.b) };
}
