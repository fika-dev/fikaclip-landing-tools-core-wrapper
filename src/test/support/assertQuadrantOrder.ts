import { assertPixelColor } from "./assertPixelColor";
import type { ContentBand } from "./assertAspectRatioFrame";
import type { FramePixels } from "./FramePixels";
import { QUADRANT_COLOURS } from "./loadQuadrantPatternSample";

/**
 * Asserts the picture inside a band is still the right way up.
 *
 * Band size and position prove the picture was not resized or mis-placed, but
 * not that it is intact: a flipped, mirrored or rotated picture fills exactly the
 * same band. Sampling the middle of each quadrant catches that, because the four
 * pattern colours only land in this order if the picture was left alone.
 */
export function assertQuadrantOrder(frame: FramePixels, band: ContentBand): void {
  const quarterX = Math.floor(band.width / 4);
  const quarterY = Math.floor(band.height / 4);
  const left = band.x + quarterX;
  const right = band.x + band.width - quarterX;
  const top = band.y + quarterY;
  const bottom = band.y + band.height - quarterY;

  assertPixelColor(frame.at(left, top), QUADRANT_COLOURS.topLeft, "top-left quadrant");
  assertPixelColor(frame.at(right, top), QUADRANT_COLOURS.topRight, "top-right quadrant");
  assertPixelColor(frame.at(left, bottom), QUADRANT_COLOURS.bottomLeft, "bottom-left quadrant");
  assertPixelColor(frame.at(right, bottom), QUADRANT_COLOURS.bottomRight, "bottom-right quadrant");
}
