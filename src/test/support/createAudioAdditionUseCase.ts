import {
  FfmpegAddAudioRepository,
  UseCase,
  type MediaEditCommand,
  type MediaEditEntity,
  type MediaEditResult,
} from "../../index";

import { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";

export type AudioAdditionCommand = Extract<MediaEditCommand, { operation: "add-audio" }>;

export type AudioAdditionUseCase = {
  execute(command: AudioAdditionCommand): Promise<MediaEditResult>;
  /** Exposed so a failing test can report the real ffmpeg argv and stderr. */
  readonly runtime: NodeFfmpegMediaEditRuntime;
};

/**
 * Assembles the add-audio use case for tests, in the same shape the app uses:
 * a `UseCase<MediaEditEntity>` holding the real `FfmpegAddAudioRepository`, with
 * `entity.result` unwrapped for ergonomics.
 *
 * The only departure from the app assembly is the runtime — a Node-backed stand
 * in instead of ffmpeg.wasm. Everything the repository decides (filters, codec
 * flags, stream mapping, output naming) runs unmodified.
 */
export function createAudioAdditionUseCase(workDir: string): AudioAdditionUseCase {
  const runtime = new NodeFfmpegMediaEditRuntime(workDir);
  const useCase = new UseCase<MediaEditEntity>([
    new FfmpegAddAudioRepository({
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
