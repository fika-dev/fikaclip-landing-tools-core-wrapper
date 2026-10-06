import fs from "node:fs/promises";

import type { MediaEditCommand, MediaSource } from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import type { TestMediaEditUseCase } from "./createMediaEditingUseCase";
import { createTestWorkspace } from "./createTestWorkspace";
import type { AudioLoudness } from "./detectAudioLoudness";
import type { FramePixels } from "./FramePixels";
import { measureOutputBlob } from "./measureOutputBlob";
import type { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";
import type { MediaProfile } from "./probeMediaProfile";

export type MediaEditCaseContext = {
  workDir: string;
  sample: CodecSampleVideo;
  /** The sample as a blob, matching how the app hands uploads to the library. */
  source: MediaSource;
};

export type RunMediaEditCaseOptions = {
  sample: CodecSampleVideo;
  /**
   * The operation's use-case factory — the same assembly the app ships, so the
   * work under test runs through the library's public surface rather than
   * through anything the tests invented.
   */
  createUseCase: (workDir: string) => TestMediaEditUseCase;
  /**
   * Builds the command once the workspace exists. Operations that need extra
   * media — an audio track, a watermark image — create it here, because those
   * files have to be synthesised before the command can reference them.
   */
  buildCommand: (context: MediaEditCaseContext) => MediaEditCommand | Promise<MediaEditCommand>;
  /** Decode the output's first frame so pixels can be asserted. */
  captureFrame?: boolean;
};

export type MediaEditCaseOutcome = {
  resultFileName: string;
  resultMimeType: string;
  resultSizeBytes: number;
  profile: MediaProfile;
  loudness: AudioLoudness;
  /** Present only when `captureFrame` was requested. */
  frame?: FramePixels;
};

/**
 * Runs one media-edit operation end to end against a committed sample, then
 * measures the result. Shared by every operation so each test file only has to
 * declare its command and its expectations.
 */
export async function runMediaEditCase(options: RunMediaEditCaseOptions): Promise<MediaEditCaseOutcome> {
  const { sample, createUseCase, buildCommand, captureFrame } = options;
  const workspace = await createTestWorkspace(`media-edit-${sample.container}`);

  try {
    const videoBytes = await fs.readFile(sample.filePath);
    const source: MediaSource = { type: "blob", blob: new Blob([new Uint8Array(videoBytes)]) };
    const command = await buildCommand({ workDir: workspace.dir, sample, source });
    const useCase = createUseCase(workspace.dir);

    const result = await useCase.execute(command).catch((error: unknown) => {
      throw describeFailure(error, sample, command, useCase.runtime);
    });
    const { profile, loudness, frame } = await measureOutputBlob(workspace.dir, result, { captureFrame });

    return {
      resultFileName: result.fileName,
      resultMimeType: result.mimeType,
      resultSizeBytes: result.sizeBytes,
      profile,
      loudness,
      ...(frame === undefined ? {} : { frame }),
    };
  } finally {
    await workspace.cleanup();
  }
}

/**
 * Folds the ffmpeg argv and stderr into the error message.
 *
 * The repository only reports an exit code, which says nothing about *why* a
 * muxer refused the output. The argv shows which codec flags were chosen and
 * the stderr carries the muxer's own explanation, so tests can assert on the
 * actual cause instead of just "it failed".
 */
function describeFailure(
  error: unknown,
  sample: CodecSampleVideo,
  command: MediaEditCommand,
  runtime: NodeFfmpegMediaEditRuntime,
): Error {
  return new Error(
    [
      error instanceof Error ? error.message : String(error),
      `--- operation ---\n${command.operation}`,
      `--- sample ---\n${sample.fileName} (${sample.videoCodec}/${sample.audioCodec})`,
      `--- ffmpeg argv ---\nffmpeg ${runtime.lastArgs.join(" ")}`,
      `--- ffmpeg stderr ---\n${runtime.lastStderr.trim()}`,
    ].join("\n"),
    { cause: error },
  );
}
