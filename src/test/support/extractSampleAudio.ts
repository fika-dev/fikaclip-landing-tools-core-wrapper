import { type AudioCodec, type AudioFormat } from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { createAudioExtractionUseCase } from "./createAudioExtractionUseCase";
import { runMediaEditCase, type MediaEditCaseOutcome } from "./runMediaEditCase";

export type ExtractSampleAudioOptions = {
  sample: CodecSampleVideo;
  format: AudioFormat;
  /** Omitted so the repository's own per-format default codec is exercised. */
  audioCodec?: Exclude<AudioCodec, "none" | "copy">;
  audioTrackIndex?: number;
  /** Decode the extracted file end to end, to prove it plays. */
  decodeCheck?: boolean;
};

/**
 * Extracts a sample's audio into an audio-only container.
 *
 * This is the one operation whose output container is independent of the
 * source's, so a WebM source is not constrained by WebM's codec profile here.
 */
export async function extractSampleAudio(options: ExtractSampleAudioOptions): Promise<MediaEditCaseOutcome> {
  const { sample, format, audioCodec, audioTrackIndex, decodeCheck } = options;

  return runMediaEditCase({
    sample,
    createUseCase: createAudioExtractionUseCase,
    ...(decodeCheck === undefined ? {} : { decodeCheck }),
    buildCommand: ({ source }) => ({
      operation: "extract-audio",
      source,
      fileName: sample.fileName,
      format,
      ...(audioCodec === undefined ? {} : { audioCodec }),
      ...(audioTrackIndex === undefined ? {} : { audioTrackIndex }),
    }),
  });
}
