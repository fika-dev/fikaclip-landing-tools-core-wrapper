import { FfmpegAddAudioRepository } from "../../index";

import { createMediaEditingUseCase, type TestMediaEditUseCase } from "./createMediaEditingUseCase";
import { createTestRuntimeConfig } from "./createTestRuntimeConfig";

/**
 * Mirrors `src/video/service/audio-addition/createAudioAdditionUseCase.ts`.
 *
 * Same repository, same wrapper, same shape. The runtime is the only difference,
 * and `createTestRuntimeConfig` documents why.
 */
export function createAudioAdditionUseCase(workDir: string): TestMediaEditUseCase {
  const config = createTestRuntimeConfig(workDir);

  return { ...createMediaEditingUseCase(new FfmpegAddAudioRepository(config)), runtime: config.runtime };
}
