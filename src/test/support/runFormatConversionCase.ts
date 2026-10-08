import fs from "node:fs/promises";

import type {
  ConvertVideoFormatDetails,
  ConvertVideoFormatOutput,
  MediaSource,
  VideoFormatConversionMode,
} from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createTestWorkspace } from "./createTestWorkspace";
import { createVideoFormatConversionUseCase } from "./createVideoFormatConversionUseCase";
import type { DecodeReport } from "./decodeMediaStreams";
import type { AudioLoudness } from "./detectAudioLoudness";
import type { FramePixels } from "./FramePixels";
import { measureOutputBlob } from "./measureOutputBlob";
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
  /** First frame of the converted video, for comparing the picture to the source. */
  frame?: FramePixels;
  /** Full-decode report, so a container rewrite cannot hide broken packets. */
  decode?: DecodeReport;
  /** The plan the conversion actually ran with: mode, resolved codecs, warnings. */
  plan: ConvertVideoFormatDetails;
  /** Exact FFmpeg arguments used by the repository. */
  ffmpegArgs: string[];
};

/**
 * Converts one sample through the app's conversion use case, then measures the
 * result.
 *
 * The conversion is entirely the library's: `createVideoFormatConversionUseCase`
 * assembles the same plan-then-transcode pipeline the app ships, from the same
 * package entry. Only the measurement afterwards belongs to the test, and it
 * deliberately uses ffprobe and a full decode rather than the library, so the
 * check stays independent of the code being checked.
 */
export async function runFormatConversionCase(
  options: RunFormatConversionCaseOptions,
): Promise<FormatConversionCaseOutcome> {
  const { sample, output, mode } = options;
  const workspace = await createTestWorkspace(`format-conversion-${sample.container}`);

  try {
    const useCase = createVideoFormatConversionUseCase(workspace.dir);
    const videoBytes = await fs.readFile(sample.filePath);
    const source: MediaSource = { type: "blob", blob: new Blob([new Uint8Array(videoBytes)]) };

    const result = await useCase
      .convert({ source, fileName: sample.fileName, output, ...(mode === undefined ? {} : { mode }) })
      .catch((error: unknown) => {
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            `--- sample ---\n${sample.fileName} (${sample.videoCodec}/${sample.audioCodec})`,
            `--- requested ---\n${JSON.stringify({ ...output, mode })}`,
            `--- ffmpeg argv ---\nffmpeg ${useCase.runtime.lastArgs.join(" ")}`,
            `--- ffmpeg stderr ---\n${useCase.runtime.lastStderr.trim()}`,
          ].join("\n"),
          { cause: error },
        );
      });

    const { profile, loudness, frame, decode } = await measureOutputBlob(workspace.dir, result, {
      captureFrame: true,
      decodeCheck: true,
    });

    return {
      resultFileName: result.fileName,
      resultMimeType: result.mimeType,
      resultSizeBytes: result.sizeBytes,
      profile,
      loudness,
      ...(frame === undefined ? {} : { frame }),
      ...(decode === undefined ? {} : { decode }),
      plan: result.details,
      ffmpegArgs: [...useCase.runtime.lastArgs],
    };
  } finally {
    await workspace.cleanup();
  }
}
