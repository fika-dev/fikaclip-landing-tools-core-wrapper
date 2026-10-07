import fs from "node:fs/promises";
import path from "node:path";

import { runFfmpegOrThrow } from "./runFfmpegOrThrow";

export type Rgb = { r: number; g: number; b: number };

export type FramePixels = {
  width: number;
  height: number;
  at(x: number, y: number): Rgb;
};

export type ReadFramePixelsOptions = {
  filePath: string;
  /** Scratch directory for the decoded raw frame. */
  workDir: string;
  width: number;
  height: number;
  /** Which frame to decode. Defaults to the first. */
  atSeconds?: number;
};

/**
 * Decodes one frame to raw RGB so tests can read individual pixels.
 *
 * Container and codec assertions cannot tell whether a filter actually drew
 * anything — a watermark's position, size and opacity all leave the codec,
 * resolution and duration identical. Only the pixels distinguish them.
 *
 * `rgb24` is requested so each pixel is three bytes at a predictable offset,
 * with no chroma subsampling to undo.
 */
export async function readFramePixels(options: ReadFramePixelsOptions): Promise<FramePixels> {
  const { filePath, workDir, width, height, atSeconds } = options;
  const frameFileName = `frame-${path.basename(filePath)}.rgb`;

  await runFfmpegOrThrow(
    [
      ...(atSeconds === undefined ? [] : ["-ss", String(atSeconds)]),
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-y",
      frameFileName,
    ],
    { cwd: workDir },
  );

  const bytes = await fs.readFile(path.join(workDir, frameFileName));
  const expectedLength = width * height * 3;

  if (bytes.length < expectedLength) {
    throw new Error(`Decoded frame is ${bytes.length} bytes, expected at least ${expectedLength} for ${width}x${height}.`);
  }

  return {
    width,
    height,
    at(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(`Pixel (${x}, ${y}) is outside the ${width}x${height} frame.`);
      }

      const offset = (y * width + x) * 3;
      return { r: bytes[offset], g: bytes[offset + 1], b: bytes[offset + 2] };
    },
  };
}
