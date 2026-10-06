import fs from "node:fs/promises";

import { FfmpegWatermarkVideoRepository } from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createWatermarkImageFile } from "./createWatermarkImageFile";
import { runMediaEditCase, type MediaEditCaseOutcome } from "./runMediaEditCase";

export type WatermarkSampleOptions = {
  sample: CodecSampleVideo;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
  captureFrame?: boolean;
};

/**
 * Overlays a synthesised watermark image on a sample.
 *
 * This operation always re-encodes the video with `-c:v libx264` and copies the
 * audio with `-c:a copy`, which is the mirror image of add-audio: here the
 * source audio codec survives and the video codec does not.
 */
export async function watermarkSample(options: WatermarkSampleOptions): Promise<MediaEditCaseOutcome> {
  const { sample, x = 8, y = 8, width, height, opacity, captureFrame } = options;

  return runMediaEditCase({
    sample,
    createRepository: (config) => new FfmpegWatermarkVideoRepository(config),
    ...(captureFrame === undefined ? {} : { captureFrame }),
    buildCommand: async ({ workDir, source }) => {
      const image = await createWatermarkImageFile({ workDir });
      const imageBytes = await fs.readFile(image.filePath);

      return {
        operation: "watermark",
        source,
        fileName: sample.fileName,
        layer: {
          image: { type: "blob", blob: new Blob([new Uint8Array(imageBytes)]) },
          fileName: image.fileName,
          x,
          y,
          ...(width === undefined ? {} : { width }),
          ...(height === undefined ? {} : { height }),
          ...(opacity === undefined ? {} : { opacity }),
        },
      };
    },
  });
}
