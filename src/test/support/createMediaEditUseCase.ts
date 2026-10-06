import {
  UseCase,
  type FfmpegMediaEditRepositoryConfig,
  type MediaEditCommand,
  type MediaEditEntity,
  type MediaEditRepository,
  type MediaEditResult,
} from "../../index";

import { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";

export type MediaEditRepositoryFactory = (config: FfmpegMediaEditRepositoryConfig) => MediaEditRepository;

export type MediaEditUseCase = {
  execute(command: MediaEditCommand): Promise<MediaEditResult>;
  /** Exposed so a failing test can report the real ffmpeg argv and stderr. */
  readonly runtime: NodeFfmpegMediaEditRuntime;
};

/**
 * Assembles any media-edit operation the way the app does: a
 * `UseCase<MediaEditEntity>` holding one repository, with `entity.result`
 * unwrapped for ergonomics.
 *
 * All six media-edit repositories are thin subclasses of the same base, so one
 * factory covers crop, extract-audio, adjust-volume, mute, add-audio and
 * watermark. The only departure from the app assembly is the runtime — a
 * Node-backed stand-in instead of ffmpeg.wasm — so every argument the
 * repository builds runs unmodified.
 */
export function createMediaEditUseCase(workDir: string, createRepository: MediaEditRepositoryFactory): MediaEditUseCase {
  const runtime = new NodeFfmpegMediaEditRuntime(workDir);
  const useCase = new UseCase<MediaEditEntity>([
    createRepository({
      // Unreachable on purpose: the config type demands a runtime location, but
      // the injected runtime means `FfmpegRuntime` is never constructed. A real
      // URL here would hide an accidental fall-through to ffmpeg.wasm.
      coreURL: "https://example.invalid/ffmpeg-core.js",
      wasmURL: "https://example.invalid/ffmpeg-core.wasm",
      runtime,
    }),
  ]);

  return {
    runtime,
    execute: async (command) => {
      const entity = await useCase.execute({ command, jobId: `${command.operation}-test` });

      if (!entity.result) throw new Error(`${command.operation} use case did not produce a result.`);

      return entity.result;
    },
  };
}
