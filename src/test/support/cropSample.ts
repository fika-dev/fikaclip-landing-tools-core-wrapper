import {
  type AudioCodec,
  type CropRegion,
  type VideoCodec,
  type VideoContainerFormat,
} from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createVideoCropUseCase } from "./createVideoCropUseCase";
import { runMediaEditCase, type MediaEditCaseOutcome } from "./runMediaEditCase";

export type CropSampleOptions = {
  sample: CodecSampleVideo;
  region: CropRegion;
  /**
   * Omitted so the repository's defaults are exercised: H.264 video and AAC
   * audio, chosen without consulting the output container.
   */
  output?: { format?: VideoContainerFormat; videoCodec?: VideoCodec; audioCodec?: AudioCodec };
  captureFrame?: boolean;
};

/** Crops a rectangle out of a sample. */
export async function cropSample(options: CropSampleOptions): Promise<MediaEditCaseOutcome> {
  const { sample, region, output, captureFrame } = options;

  return runMediaEditCase({
    sample,
    createUseCase: createVideoCropUseCase,
    ...(captureFrame === undefined ? {} : { captureFrame }),
    buildCommand: ({ source }) => ({
      operation: "crop",
      source,
      fileName: sample.fileName,
      region,
      ...(output === undefined ? {} : { output }),
    }),
  });
}
