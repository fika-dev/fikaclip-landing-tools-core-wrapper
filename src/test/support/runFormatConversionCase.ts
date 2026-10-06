import fs from "node:fs/promises";

import {
  CodecCompatibilityRepository,
  CreateVideoFormatConversionPlanRepository,
  FfmpegMediaProbeRepository,
  FfmpegVideoFormatTranscodeRepository,
  TranscodeVideoFormatRepository,
  UseCase,
  type ConvertVideoFormatEntity,
  type ConvertVideoFormatOutput,
  type ConvertVideoFormatDetails,
  type MediaSource,
  type VideoFormatConversionMode,
} from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createTestWorkspace } from "./createTestWorkspace";
import type { AudioLoudness } from "./detectAudioLoudness";
import { measureOutputBlob } from "./measureOutputBlob";
import { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";
import type { MediaProfile } from "./probeMediaProfile";

export type RunFormatConversionCaseOptions = {
  sample: CodecSampleVideo;
  output: ConvertVideoFormatOutput;
  mode?: VideoFormatConversionMode;
};

export type FormatConversionCaseOutcome = {
  resultFileName: string;
  resultMimeType: string;
  resultSizeBytes: number;
  profile: MediaProfile;
  loudness: AudioLoudness;
  /** The plan the conversion actually ran with: mode, resolved codecs, warnings. */
  plan: ConvertVideoFormatDetails;
  ffmpegArgs: string[];
};

/**
 * Runs one format conversion through the full app assembly: plan first, then
 * transcode.
 *
 * The plan step probes the input, and probing needs a browser — the probe
 * repository rejects a non-browser environment outright. The plan repository
 * swallows that failure by design and continues without input metadata, so
 * conversion still runs here; what it cannot exercise is the "codec already
 * matches, copy instead of re-encode" optimisation, which depends on that
 * metadata. That path is covered by the plan's own logic tests, with metadata
 * supplied directly and no media involved.
 */
export async function runFormatConversionCase(
  options: RunFormatConversionCaseOptions,
): Promise<FormatConversionCaseOutcome> {
  const { sample, output, mode } = options;
  const workspace = await createTestWorkspace(`format-conversion-${sample.container}`);

  try {
    const runtime = new NodeFfmpegMediaEditRuntime(workspace.dir);
    const runtimeConfig = {
      coreURL: "https://example.invalid/ffmpeg-core.js",
      wasmURL: "https://example.invalid/ffmpeg-core.wasm",
      runtime,
    };
    const useCase = new UseCase<ConvertVideoFormatEntity>([
      new CreateVideoFormatConversionPlanRepository(
        new FfmpegMediaProbeRepository(runtimeConfig),
        new CodecCompatibilityRepository(),
      ),
      new TranscodeVideoFormatRepository(new FfmpegVideoFormatTranscodeRepository(runtimeConfig)),
    ]);
    const videoBytes = await fs.readFile(sample.filePath);
    const source: MediaSource = { type: "blob", blob: new Blob([new Uint8Array(videoBytes)]) };

    const entity = await useCase
      .execute({
        command: { source, fileName: sample.fileName, output, ...(mode === undefined ? {} : { mode }) },
        jobId: "format-conversion-test",
      })
      .catch((error: unknown) => {
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            `--- sample ---\n${sample.fileName} (${sample.videoCodec}/${sample.audioCodec})`,
            `--- requested ---\n${JSON.stringify({ ...output, mode })}`,
            `--- ffmpeg argv ---\nffmpeg ${runtime.lastArgs.join(" ")}`,
            `--- ffmpeg stderr ---\n${runtime.lastStderr.trim()}`,
          ].join("\n"),
          { cause: error },
        );
      });

    if (!entity.result) throw new Error("Format conversion use case did not produce a result.");

    const { profile, loudness } = await measureOutputBlob(workspace.dir, entity.result);

    return {
      resultFileName: entity.result.fileName,
      resultMimeType: entity.result.mimeType,
      resultSizeBytes: entity.result.sizeBytes,
      profile,
      loudness,
      plan: entity.result.details,
      ffmpegArgs: runtime.lastArgs,
    };
  } finally {
    await workspace.cleanup();
  }
}
