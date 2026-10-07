import {
  FfmpegVideoAspectRatioRepository,
  UseCase,
  type EditVideoAspectRatioCommand,
  type EditVideoAspectRatioEntity,
  type EditVideoAspectRatioResult,
} from "../../index";

import { createTestRuntimeConfig } from "./createTestRuntimeConfig";
import type { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";

export type VideoAspectRatioUseCase = {
  transform(command: EditVideoAspectRatioCommand): Promise<EditVideoAspectRatioResult>;
  readonly runtime: NodeFfmpegMediaEditRuntime;
};

/**
 * Mirrors the `transform` half of
 * `src/video/service/video-aspect-ratio/createVideoAspectRatioUseCase.ts`.
 *
 * The app's `inspect` is left out for the same reason as in the conversion
 * factory: it needs a browser. Tests therefore pass the output profile in
 * explicitly, which is what the app does with whatever inspection returned.
 */
export function createVideoAspectRatioUseCase(workDir: string): VideoAspectRatioUseCase {
  const config = createTestRuntimeConfig(workDir);
  const useCase = new UseCase<EditVideoAspectRatioEntity>([new FfmpegVideoAspectRatioRepository(config)]);

  return {
    runtime: config.runtime,
    transform: async (command) => {
      const entity = await useCase.execute({
        command,
        jobId: command.job?.jobId ?? `aspect-ratio-${command.aspectRatio}-test`,
      });

      if (!entity.result) throw new Error("Video aspect ratio use case did not produce a result.");

      return entity.result;
    },
  };
}
