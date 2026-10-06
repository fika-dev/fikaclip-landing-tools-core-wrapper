import {
  UseCase,
  type MediaEditCommand,
  type MediaEditEntity,
  type MediaEditRepository,
  type MediaEditResult,
} from "../../index";

import type { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";

export type MediaEditingUseCase = {
  execute(command: MediaEditCommand): Promise<MediaEditResult>;
};

/**
 * The app's use case plus a handle on the runtime.
 *
 * The app has no reason to reach the runtime; a failing test does, because the
 * repository only reports an exit code and the argv and stderr are what explain
 * it. That handle is the only addition.
 */
export type TestMediaEditUseCase = MediaEditingUseCase & {
  readonly runtime: NodeFfmpegMediaEditRuntime;
};

/**
 * Mirrors the application's `createMediaEditingUseCase`: one repository inside a
 * `UseCase<MediaEditEntity>`, with `entity.result` unwrapped for the caller.
 *
 * Kept deliberately identical to `src/video/service/media-editing/MediaEditingUseCase.ts`
 * so the tests assemble the library the way a consumer does rather than inventing
 * a shortcut. If the app's assembly changes, this should change with it.
 */
export function createMediaEditingUseCase(repository: MediaEditRepository): MediaEditingUseCase {
  const useCase = new UseCase<MediaEditEntity>([repository]);

  return {
    execute: async (command) => {
      const entity = await useCase.execute({
        command,
        jobId: command.job?.jobId ?? `${command.operation}-test`,
      });

      if (!entity.result) throw new Error(`${command.operation} use case did not produce a result.`);

      return entity.result;
    },
  };
}
