import {
  FfmpegCropVideoRepository,
  type AudioCodec,
  type CropRegion,
  type VideoCodec,
  type VideoContainerFormat,
} from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { runMediaEditCase, type MediaEditCaseOutcome } from "./runMediaEditCase";

export type CropSampleOptions = {
  sample: CodecSampleVideo;
  region: CropRegion;
  /**
   * Omitted so the repository's defaults are exercised: H.264 video and AAC
   * audio, chosen without consulting the output container.
   */
  output?: { format?: VideoContainerFormat; videoCodec?: VideoCodec; audioCodec?: AudioCodec };
};

/** Crops a rectangle out of a sample. */
export async function cropSample(options: CropSampleOptions): Promise<MediaEditCaseOutcome> {
  const { sample, region, output } = options;

  return runMediaEditCase({
    sample,
    createRepository: (config) => new FfmpegCropVideoRepository(config),
    buildCommand: ({ source }) => ({
      operation: "crop",
      source,
      fileName: sample.fileName,
      region,
      ...(output === undefined ? {} : { output }),
    }),
  });
}
