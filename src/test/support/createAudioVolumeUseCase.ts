import { FfmpegAdjustAudioVolumeRepository } from "../../index";

import { createMediaEditingUseCase, type TestMediaEditUseCase } from "./createMediaEditingUseCase";
import { createTestRuntimeConfig } from "./createTestRuntimeConfig";

/**
 * Mirrors `src/video/service/audio-volume/createAudioVolumeUseCase.ts`.
 *
 * Same repository, same wrapper, same shape. The runtime is the only difference,
 * and `createTestRuntimeConfig` documents why.
 */
export function createAudioVolumeUseCase(workDir: string): TestMediaEditUseCase {
  const config = createTestRuntimeConfig(workDir);

  return { ...createMediaEditingUseCase(new FfmpegAdjustAudioVolumeRepository(config)), runtime: config.runtime };
}
