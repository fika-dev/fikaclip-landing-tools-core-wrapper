import assert from "node:assert/strict";

import type { FramePixels, Rgb } from "./FramePixels";

export type ExpectedAspectRatioFrame = {
  width: number;
  height: number;
};

/** Where the picture ended up inside the padded frame. */
export type ContentBand = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** A padded row reads as 0 with a few units of bleed from chroma subsampling. */
const BLACK_TOLERANCE = 12;

function isBlack(colour: Rgb): boolean {
  return colour.r <= BLACK_TOLERANCE && colour.g <= BLACK_TOLERANCE && colour.b <= BLACK_TOLERANCE;
}

/**
 * Where a centred picture actually starts.
 *
 * Exact centring would be `(frame - picture) / 2`, but yuv420p stores one chroma
 * sample per 2x2 block, so a picture can only begin on an even row or column and
 * the offset rounds down. A 360px picture in a 1138px frame therefore sits at 388
 * rather than 389, leaving 388px above and 390px below — one pixel off centre,
 * which is the closest the pixel format can express.
 */
function centredOffset(frameSize: number, pictureSize: number): number {
  return Math.floor((frameSize - pictureSize) / 2 / 2) * 2;
}

/** First and last index along a line that is not padding. */
function findContentBand(read: (index: number) => Rgb, length: number): { start: number; end: number } {
  let start = 0;
  while (start < length && isBlack(read(start))) start += 1;

  let end = length - 1;
  while (end >= 0 && isBlack(read(end))) end -= 1;

  return { start, end };
}

/**
 * Asserts the transform padded the frame instead of stretching it.
 *
 * The output frame size alone cannot tell those apart — a stretched picture
 * fills exactly the same box as a padded one. What distinguishes them is where
 * the picture ends: scanning in from the black edges finds the content band, and
 * a band that still measures the source's own width and height, sitting exactly
 * in the middle, means the picture was moved and surrounded rather than resized.
 *
 * This is the rule `AGENTS.md` states for the operation — keep the source ratio,
 * centre it, fill the rest with black — expressed as pixels.
 *
 * Returns the band it found, so a caller can go on to check what is inside it.
 */
export function assertAspectRatioFrame(options: {
  frame: FramePixels;
  /** The same sample measured before the transform, as the baseline. */
  sourceFrame: FramePixels;
  expected: ExpectedAspectRatioFrame;
}): ContentBand {
  const { frame, sourceFrame, expected } = options;

  // Precondition: the scan finds the picture by its contrast with black padding,
  // so a fixture that is itself black would make every reading meaningless.
  assert.ok(
    !isBlack(sourceFrame.at(Math.floor(sourceFrame.width / 2), Math.floor(sourceFrame.height / 2))),
    "the fixture's picture must not be black, or the padding scan cannot find it",
  );

  assert.equal(frame.width, expected.width, "output frame width");
  assert.equal(frame.height, expected.height, "output frame height");

  const centreX = Math.floor(expected.width / 2);
  const centreY = Math.floor(expected.height / 2);
  const rows = findContentBand((y) => frame.at(centreX, y), frame.height);
  const columns = findContentBand((x) => frame.at(x, centreY), frame.width);

  assert.equal(
    rows.end - rows.start + 1,
    sourceFrame.height,
    `picture height changed: expected the source's ${sourceFrame.height}px, got ${rows.end - rows.start + 1}px`,
  );
  assert.equal(
    columns.end - columns.start + 1,
    sourceFrame.width,
    `picture width changed: expected the source's ${sourceFrame.width}px, got ${columns.end - columns.start + 1}px`,
  );
  assert.equal(rows.start, centredOffset(expected.height, sourceFrame.height), "picture is not vertically centred");
  assert.equal(columns.start, centredOffset(expected.width, sourceFrame.width), "picture is not horizontally centred");

  // Every side that gained room must actually be filled with black.
  if (rows.start > 0) {
    assert.ok(isBlack(frame.at(centreX, 0)), "top padding must be black");
    assert.ok(isBlack(frame.at(centreX, expected.height - 1)), "bottom padding must be black");
  }
  if (columns.start > 0) {
    assert.ok(isBlack(frame.at(0, centreY)), "left padding must be black");
    assert.ok(isBlack(frame.at(expected.width - 1, centreY)), "right padding must be black");
  }

  return {
    x: columns.start,
    y: rows.start,
    width: columns.end - columns.start + 1,
    height: rows.end - rows.start + 1,
  };
}
