import fs from "node:fs";
import path from "node:path";

import type { VideoAspectRatio } from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import type { Rgb } from "./FramePixels";
import { resolveFixturesDir } from "./resolveFixturesDir";

/**
 * The four quadrants of the pattern fixtures, each a flat saturated colour.
 *
 * The codec samples are a single flat colour, which makes them useless for any
 * assertion about *where* in the frame something happened — a crop at (0, 0) and
 * a crop at (320, 180) come out pixel-identical. These fixtures exist so position
 * and orientation are observable: each quadrant is a different colour, so the
 * colours in the output say which region was taken and which way up it is.
 *
 * Flat blocks were chosen over a gradient or `testsrc` because low-frequency
 * colour survives lossy coding almost intact — these read back within a few units
 * of their nominal values even after two H.264 passes.
 */
export const QUADRANT_COLOURS: Record<"topLeft" | "topRight" | "bottomLeft" | "bottomRight", Rgb> = {
  topLeft: { r: 255, g: 0, b: 0 },
  topRight: { r: 0, g: 255, b: 0 },
  bottomLeft: { r: 0, g: 0, b: 255 },
  bottomRight: { r: 255, g: 255, b: 0 },
};

/**
 * One pattern fixture per aspect ratio, so a ratio-to-ratio transform has a
 * source that is already in the starting ratio.
 *
 * They share a 360px short side, which keeps the padded output sizes easy to
 * check by hand.
 */
const PATTERN_SIZES: Record<VideoAspectRatio, { width: number; height: number }> = {
  "16:9": { width: 640, height: 360 },
  "9:16": { width: 360, height: 640 },
  "4:3": { width: 480, height: 360 },
  "1:1": { width: 360, height: 360 },
};

/**
 * Describes a pattern fixture as a `CodecSampleVideo` so it drops into the same
 * case runners as the codec samples. All of them are H.264/AAC in MP4, because
 * the things they are used to check — position, orientation, padding — have
 * nothing to do with the container.
 */
export function loadQuadrantPatternSample(aspectRatio: VideoAspectRatio = "16:9"): CodecSampleVideo {
  const { width, height } = PATTERN_SIZES[aspectRatio];
  const fileName = `quadrants-${width}x${height}-1s.mp4`;
  const filePath = path.join(resolveFixturesDir(), "patterns", fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`The ${aspectRatio} quadrant pattern fixture is missing at ${filePath}.`);
  }

  return {
    fileName,
    filePath,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    durationSeconds: 1,
    width,
    height,
    sampleRate: 48000,
    channels: 2,
  };
}
