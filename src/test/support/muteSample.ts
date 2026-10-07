import { type MuteSegment } from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createAudioMuteUseCase } from "./createAudioMuteUseCase";
import { runMediaEditCase, type MediaEditCaseOutcome } from "./runMediaEditCase";

export type MuteSampleOptions = {
  sample: CodecSampleVideo;
  /**
   * `muteAll` drops the audio stream entirely with `-an`; segment muting keeps a
   * stream and re-encodes it to AAC. The two take different code paths, and only
   * the second one depends on the container accepting AAC.
   */
  muteAll?: boolean;
  segments?: MuteSegment[];
};

/** Mutes a sample either wholesale or over given ranges. */
export async function muteSample(options: MuteSampleOptions): Promise<MediaEditCaseOutcome> {
  const { sample, muteAll, segments } = options;

  return runMediaEditCase({
    sample,
    createUseCase: createAudioMuteUseCase,
    buildCommand: ({ source }) => ({
      operation: "mute",
      source,
      fileName: sample.fileName,
      ...(muteAll === undefined ? {} : { muteAll }),
      ...(segments === undefined ? {} : { segments }),
    }),
  });
}
