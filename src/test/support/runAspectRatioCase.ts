import fs from "node:fs/promises";

import type {
  MediaSource,
  OutputAudioCodec,
  OutputVideoCodec,
  VideoAspectRatio,
  VideoContainerFormat,
} from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createTestWorkspace } from "./createTestWorkspace";
import { createVideoAspectRatioUseCase } from "./createVideoAspectRatioUseCase";
import type { AudioLoudness } from "./detectAudioLoudness";
import { measureOutputBlob } from "./measureOutputBlob";
import type { MediaProfile } from "./probeMediaProfile";

export type RunAspectRatioCaseOptions = {
  sample: CodecSampleVideo;
  aspectRatio: VideoAspectRatio;
  /**
   * The repository requires a complete output profile and rejects a `copy`
   * video codec, because padding has to re-encode the frame.
   */
  output: {
    format: VideoContainerFormat;
    videoCodec: OutputVideoCodec;
    /** `none` drops the audio stream with `-an`. */
    audioCodec: OutputAudioCodec | "none";
  };
};

export type AspectRatioCaseOutcome = {
  resultFileName: string;
  resultMimeType: string;
  resultSizeBytes: number;
  profile: MediaProfile;
  loudness: AudioLoudness;
};

/**
 * Transforms one sample through the app's aspect-ratio use case, then measures
 * the result.
 *
 * As with the other runners, the transform is the library's own assembly and
 * only the measurement is the test's.
 */
export async function runAspectRatioCase(options: RunAspectRatioCaseOptions): Promise<AspectRatioCaseOutcome> {
  const { sample, aspectRatio, output } = options;
  const workspace = await createTestWorkspace(`aspect-ratio-${sample.container}`);

  try {
    const useCase = createVideoAspectRatioUseCase(workspace.dir);
    const videoBytes = await fs.readFile(sample.filePath);
    const source: MediaSource = { type: "blob", blob: new Blob([new Uint8Array(videoBytes)]) };

    const result = await useCase
      .transform({ source, fileName: sample.fileName, aspectRatio, output })
      .catch((error: unknown) => {
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            `--- sample ---\n${sample.fileName} (${sample.videoCodec}/${sample.audioCodec})`,
            `--- requested ---\n${aspectRatio} → ${output.format}/${output.videoCodec}/${output.audioCodec}`,
            `--- ffmpeg argv ---\nffmpeg ${useCase.runtime.lastArgs.join(" ")}`,
            `--- ffmpeg stderr ---\n${useCase.runtime.lastStderr.trim()}`,
          ].join("\n"),
          { cause: error },
        );
      });

    const { profile, loudness } = await measureOutputBlob(workspace.dir, result);

    return {
      resultFileName: result.fileName,
      resultMimeType: result.mimeType,
      resultSizeBytes: result.sizeBytes,
      profile,
      loudness,
    };
  } finally {
    await workspace.cleanup();
  }
}
