import fs from "node:fs/promises";

import type { BeepAudioCodec } from "./BeepAudioEncoding";
import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createBeepAudioFile } from "./createBeepAudioFile";
import { createAudioAdditionUseCase } from "./createAudioAdditionUseCase";
import { runMediaEditCase, type MediaEditCaseOutcome } from "./runMediaEditCase";

export type InsertBeepIntoSampleOptions = {
  sample: CodecSampleVideo;
  beepCodec: BeepAudioCodec;
  /** Passed through to the track so a silent mix can be requested on purpose. */
  trackVolume?: number;
  beepSeconds?: number;
};

/** Synthesises a beep in the requested codec and runs add-audio with it. */
export async function insertBeepIntoSample(options: InsertBeepIntoSampleOptions): Promise<MediaEditCaseOutcome> {
  const { sample, beepCodec, trackVolume, beepSeconds = 1 } = options;

  return runMediaEditCase({
    sample,
    createUseCase: createAudioAdditionUseCase,
    buildCommand: async ({ workDir, source }) => {
      const beep = await createBeepAudioFile({ workDir, codec: beepCodec, seconds: beepSeconds });
      const beepBytes = await fs.readFile(beep.filePath);

      return {
        operation: "add-audio",
        source,
        fileName: sample.fileName,
        tracks: [
          {
            source: { type: "blob", blob: new Blob([new Uint8Array(beepBytes)]) },
            fileName: beep.fileName,
            ...(trackVolume === undefined ? {} : { volume: trackVolume }),
          },
        ],
      };
    },
  });
}
