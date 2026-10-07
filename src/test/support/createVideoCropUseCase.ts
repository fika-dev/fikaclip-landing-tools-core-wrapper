import { FfmpegCropVideoRepository } from "../../index";

import { createMediaEditingUseCase, type TestMediaEditUseCase } from "./createMediaEditingUseCase";
import { createTestRuntimeConfig } from "./createTestRuntimeConfig";

/**
 * Mirrors `src/video/service/video-crop/createVideoCropUseCase.ts`.
 *
 * Same repository, same wrapper, same shape. The runtime is the only difference,
 * and `createTestRuntimeConfig` documents why.
 */
export function createVideoCropUseCase(workDir: string): TestMediaEditUseCase {
  const config = createTestRuntimeConfig(workDir);

  return { ...createMediaEditingUseCase(new FfmpegCropVideoRepository(config)), runtime: config.runtime };
}
