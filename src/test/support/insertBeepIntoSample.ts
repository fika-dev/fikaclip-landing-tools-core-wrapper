import fs from "node:fs/promises";
import path from "node:path";

import type { BeepAudioCodec } from "./BeepAudioEncoding";
import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createAudioAdditionUseCase } from "./createAudioAdditionUseCase";
import { createBeepAudioFile } from "./createBeepAudioFile";
import { createTestWorkspace } from "./createTestWorkspace";
import { detectAudioLoudness, type AudioLoudness } from "./detectAudioLoudness";
import { probeMediaProfile, type MediaProfile } from "./probeMediaProfile";

export type AudioAdditionOutcome = {
  resultFileName: string;
  resultMimeType: string;
  resultSizeBytes: number;
  profile: MediaProfile;
  loudness: AudioLoudness;
  /** The argv `FfmpegMediaEditRepository` produced, for assertions and reports. */
  ffmpegArgs: string[];
};

export type InsertBeepIntoSampleOptions = {
  sample: CodecSampleVideo;
  beepCodec: BeepAudioCodec;
  /** Passed through to the track so a silent mix can be requested on purpose. */
  trackVolume?: number;
  beepSeconds?: number;
};

/**
 * Runs one add-audio case end to end: synthesise a beep, hand both the sample
 * and the beep to the use case as blobs (the way the app does), then measure
 * the returned media.
 *
 * Measurement happens before cleanup because the repository deletes its own
 * output from the runtime FS once it has read the bytes, so the blob it returns
 * is the only copy.
 */
export async function insertBeepIntoSample(options: InsertBeepIntoSampleOptions): Promise<AudioAdditionOutcome> {
  const { sample, beepCodec, trackVolume, beepSeconds = 1 } = options;
  const workspace = await createTestWorkspace(`audio-addition-${sample.container}`);

  try {
    const beep = await createBeepAudioFile({ workDir: workspace.dir, codec: beepCodec, seconds: beepSeconds });
    const useCase = createAudioAdditionUseCase(workspace.dir);
    const [videoBytes, beepBytes] = await Promise.all([fs.readFile(sample.filePath), fs.readFile(beep.filePath)]);

    const result = await useCase
      .execute({
        operation: "add-audio",
        source: { type: "blob", blob: new Blob([new Uint8Array(videoBytes)]) },
        fileName: sample.fileName,
        tracks: [
          {
            source: { type: "blob", blob: new Blob([new Uint8Array(beepBytes)]) },
            fileName: beep.fileName,
            ...(trackVolume === undefined ? {} : { volume: trackVolume }),
          },
        ],
      })
      .catch((error: unknown) => {
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            `--- sample ---\n${sample.fileName} (${sample.videoCodec}/${sample.audioCodec})`,
            `--- inserted beep ---\n${beep.fileName} (${beepCodec})`,
            `--- ffmpeg argv ---\nffmpeg ${useCase.runtime.lastArgs.join(" ")}`,
            `--- ffmpeg stderr ---\n${useCase.runtime.lastStderr.trim()}`,
          ].join("\n"),
          { cause: error },
        );
      });

    const outputPath = path.join(workspace.dir, `probe-target${path.extname(result.fileName)}`);
    await fs.writeFile(outputPath, new Uint8Array(await result.blob.arrayBuffer()));

    const [profile, loudness] = await Promise.all([probeMediaProfile(outputPath), detectAudioLoudness(outputPath)]);

    return {
      resultFileName: result.fileName,
      resultMimeType: result.mimeType,
      resultSizeBytes: result.sizeBytes,
      profile,
      loudness,
      ffmpegArgs: useCase.runtime.lastArgs,
    };
  } finally {
    await workspace.cleanup();
  }
}
