import { type AudioVolumeSegment } from "../../index";

import type { AudioSegmentWindow } from "./AudioSegmentWindow";
import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createAudioVolumeUseCase } from "./createAudioVolumeUseCase";
import { runMediaEditCase, type MediaEditCaseOutcome } from "./runMediaEditCase";

export type AdjustSampleVolumeOptions = {
  sample: CodecSampleVideo;
  /** An empty list means the repository emits a neutral `volume=1` filter. */
  segments: AudioVolumeSegment[];
  /** Slices of the output to measure, for checking which ranges moved. */
  segmentWindows?: readonly AudioSegmentWindow[];
};

/**
 * Adjusts the volume of a sample's own audio.
 *
 * Unlike add-audio, this operation works on the source audio track, so a
 * `volume: 0` segment proves the source audio is what reaches the output.
 */
export async function adjustSampleVolume(options: AdjustSampleVolumeOptions): Promise<MediaEditCaseOutcome> {
  const { sample, segments, segmentWindows } = options;

  return runMediaEditCase({
    sample,
    createUseCase: createAudioVolumeUseCase,
    ...(segmentWindows === undefined ? {} : { segmentWindows }),
    buildCommand: ({ source }) => ({
      operation: "adjust-volume",
      source,
      fileName: sample.fileName,
      segments,
    }),
  });
}
