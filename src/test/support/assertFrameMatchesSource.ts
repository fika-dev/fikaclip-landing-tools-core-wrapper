import { assertPixelColor, assertPixelNotColor } from "./assertPixelColor";
import type { FramePixels } from "./FramePixels";

/** Points well away from any overlay, used as the "nothing else moved" check. */
const UNTOUCHED_POINTS: readonly [number, number][] = [
  [200, 200],
  [400, 300],
  [600, 40],
  [320, 180],
];

/**
 * Re-encoding shifts even a flat colour. VP8 at libvpx's default quality moves
 * the fixtures' background by up to 16 per channel, so a transcode needs a
 * looser bound than a stream copy, which reproduces the pixels exactly.
 */
export const TRANSCODE_PIXEL_TOLERANCE = 28;
export const STREAM_COPY_PIXEL_TOLERANCE = 4;

const BLACK = { r: 0, g: 0, b: 0 };

/**
 * Asserts the picture is still the source's picture at the sampled points.
 *
 * The tolerance has to be loose enough for a re-encode, which also means a
 * blank frame could slip through on a dark fixture — so the frame is separately
 * required not to be black. Together they rule out both "the wrong picture" and
 * "no picture".
 */
export function assertFrameMatchesSource(
  frame: FramePixels,
  sourceFrame: FramePixels,
  options: { tolerance?: number; points?: readonly [number, number][] } = {},
): void {
  const { tolerance = STREAM_COPY_PIXEL_TOLERANCE, points = UNTOUCHED_POINTS } = options;

  for (const [x, y] of points) {
    assertPixelColor(frame.at(x, y), sourceFrame.at(x, y), `pixel (${x}, ${y})`, tolerance);
    assertPixelNotColor(frame.at(x, y), BLACK, `pixel (${x}, ${y}) must not be a blank frame`, 12);
  }
}
