import path from "node:path";

import type { Rgb } from "./FramePixels";
import { runFfmpegOrThrow } from "./runFfmpegOrThrow";

/** The colour `createWatermarkImageFile` paints by default, as RGB. */
export const WATERMARK_IMAGE_RGB: Rgb = { r: 255, g: 0, b: 0 };

export type WatermarkImageFile = {
  fileName: string;
  filePath: string;
  width: number;
  height: number;
};

export type CreateWatermarkImageFileOptions = {
  workDir: string;
  width?: number;
  height?: number;
  color?: string;
};

/**
 * Synthesises the watermark image at runtime.
 *
 * A flat colour block is enough: the watermark filter chain is about scaling,
 * alpha and placement, none of which depend on the picture's content. PNG keeps
 * an alpha channel, which the opacity stage needs.
 */
export async function createWatermarkImageFile(
  options: CreateWatermarkImageFileOptions,
): Promise<WatermarkImageFile> {
  const { workDir, width = 64, height = 64, color = "red" } = options;
  const fileName = `watermark-${width}x${height}.png`;

  await runFfmpegOrThrow(
    ["-f", "lavfi", "-i", `color=c=${color}:s=${width}x${height}`, "-frames:v", "1", "-y", fileName],
    { cwd: workDir },
  );

  return { fileName, filePath: path.join(workDir, fileName), width, height };
}
