import { FfmpegExtractAudioRepository } from "../../index";

import { createMediaEditingUseCase, type TestMediaEditUseCase } from "./createMediaEditingUseCase";
import { createTestRuntimeConfig } from "./createTestRuntimeConfig";

/**
 * Mirrors `src/video/service/audio-extraction/createAudioExtractionUseCase.ts`.
 *
 * Same repository, same wrapper, same shape. The runtime is the only difference,
 * and `createTestRuntimeConfig` documents why.
 */
export function createAudioExtractionUseCase(workDir: string): TestMediaEditUseCase {
  const config = createTestRuntimeConfig(workDir);

  return { ...createMediaEditingUseCase(new FfmpegExtractAudioRepository(config)), runtime: config.runtime };
}
