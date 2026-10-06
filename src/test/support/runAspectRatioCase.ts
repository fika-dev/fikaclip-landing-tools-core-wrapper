import fs from "node:fs/promises";

import {
  FfmpegVideoAspectRatioRepository,
  UseCase,
  type EditVideoAspectRatioEntity,
  type MediaSource,
  type OutputAudioCodec,
  type OutputVideoCodec,
  type VideoAspectRatio,
  type VideoContainerFormat,
} from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createTestWorkspace } from "./createTestWorkspace";
import type { AudioLoudness } from "./detectAudioLoudness";
import { measureOutputBlob } from "./measureOutputBlob";
import { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";
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
  warnings: string[];
  ffmpegArgs: string[];
};

/** Runs one aspect-ratio transform against a committed sample and measures it. */
export async function runAspectRatioCase(options: RunAspectRatioCaseOptions): Promise<AspectRatioCaseOutcome> {
  const { sample, aspectRatio, output } = options;
  const workspace = await createTestWorkspace(`aspect-ratio-${sample.container}`);

  try {
    const runtime = new NodeFfmpegMediaEditRuntime(workspace.dir);
    const useCase = new UseCase<EditVideoAspectRatioEntity>([
      new FfmpegVideoAspectRatioRepository({
        coreURL: "https://example.invalid/ffmpeg-core.js",
        wasmURL: "https://example.invalid/ffmpeg-core.wasm",
        runtime,
      }),
    ]);
    const videoBytes = await fs.readFile(sample.filePath);
    const source: MediaSource = { type: "blob", blob: new Blob([new Uint8Array(videoBytes)]) };

    const entity = await useCase
      .execute({
        command: { source, fileName: sample.fileName, aspectRatio, output },
        jobId: `aspect-ratio-${aspectRatio}-test`,
      })
      .catch((error: unknown) => {
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            `--- sample ---\n${sample.fileName} (${sample.videoCodec}/${sample.audioCodec})`,
            `--- requested ---\n${aspectRatio} → ${output.format}/${output.videoCodec}/${output.audioCodec}`,
            `--- ffmpeg argv ---\nffmpeg ${runtime.lastArgs.join(" ")}`,
            `--- ffmpeg stderr ---\n${runtime.lastStderr.trim()}`,
          ].join("\n"),
          { cause: error },
        );
      });

    if (!entity.result) throw new Error("Aspect ratio use case did not produce a result.");

    const { profile, loudness } = await measureOutputBlob(workspace.dir, entity.result);

    return {
      resultFileName: entity.result.fileName,
      resultMimeType: entity.result.mimeType,
      resultSizeBytes: entity.result.sizeBytes,
      profile,
      loudness,
      warnings: entity.result.details.warnings,
      ffmpegArgs: runtime.lastArgs,
    };
  } finally {
    await workspace.cleanup();
  }
}
