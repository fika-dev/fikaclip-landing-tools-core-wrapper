import {
  CodecCompatibilityRepository,
  type ConvertVideoFormatCommand,
  type ConvertVideoFormatEntity,
  type ConvertVideoFormatResult,
  CreateVideoFormatConversionPlanRepository,
  FfmpegMediaProbeRepository,
  FfmpegVideoFormatTranscodeRepository,
  type MediaProbeRepository,
  MediaPipelineUseCase,
} from "../../index";
import { createTestRuntimeConfig } from "./createTestRuntimeConfig";
import type { NodeFfmpegMediaEditRuntime } from "./NodeFfmpegMediaEditRuntime";

export type VideoFormatConversionUseCase = {
  convert(command: ConvertVideoFormatCommand): Promise<ConvertVideoFormatResult>;
  readonly runtime: NodeFfmpegMediaEditRuntime;
};

/**
 * Mirrors the `convert` half of `src/video/service/video-format-conversion/createVideoFormatConversionUseCase.ts`:
 * plan the conversion first, then transcode.
 *
 * The app's `inspect` and `getUploadPolicy` are left out because both are
 * browser-only — inspection goes through `BrowserMediaProbeRepository`, which
 * refuses a non-browser environment outright, and the upload policy reads
 * `navigator`. The probe repository is still wired into the plan step exactly as
 * the app wires it, so the plan takes the same path it does in production,
 * including the swallowed probe failure when inspection is unavailable.
 */
export function createVideoFormatConversionUseCase(workDir: string): VideoFormatConversionUseCase {
  const config = createTestRuntimeConfig(workDir);
  const unavailableProbe: MediaProbeRepository = {
    id: "unavailable-test-probe",
    execute: async () => {
      throw new Error("Browser media inspection is unavailable in native FFmpeg tests.");
    },
  };
  const mediaProbeRepository = new FfmpegMediaProbeRepository({
    ...config,
    baseProbeRepository: unavailableProbe,
  });
  const useCase = new MediaPipelineUseCase<ConvertVideoFormatEntity>([
    new CreateVideoFormatConversionPlanRepository(mediaProbeRepository, new CodecCompatibilityRepository()),
    new FfmpegVideoFormatTranscodeRepository(config),
  ]);

  return {
    runtime: config.runtime,
    convert: async (command) => {
      const entity = await useCase.execute({
        command,
        jobId: command.job?.jobId ?? "format-conversion-test",
      });

      if (!entity.result) throw new Error("Video format conversion use case did not produce a result.");

      return entity.result;
    },
  };
}
