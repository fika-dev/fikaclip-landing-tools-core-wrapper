import { FfmpegMuteAudioRepository } from "../../index";

import { createMediaEditingUseCase, type TestMediaEditUseCase } from "./createMediaEditingUseCase";
import { createTestRuntimeConfig } from "./createTestRuntimeConfig";

/**
 * Mirrors `src/video/service/audio-mute/createAudioMuteUseCase.ts`.
 *
 * Same repository, same wrapper, same shape. The runtime is the only difference,
 * and `createTestRuntimeConfig` documents why.
 */
export function createAudioMuteUseCase(workDir: string): TestMediaEditUseCase {
  const config = createTestRuntimeConfig(workDir);

  return { ...createMediaEditingUseCase(new FfmpegMuteAudioRepository(config)), runtime: config.runtime };
}
