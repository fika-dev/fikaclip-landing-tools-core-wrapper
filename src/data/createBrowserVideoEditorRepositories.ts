import {
  CodecCompatibilityRepository,
  CreateVideoFormatConversionPlanRepository,
  type ConvertVideoFormatCommand,
  TranscodeVideoFormatRepository,
  UseCase,
  type ConvertVideoFormatEntity,
  type ConvertVideoFormatResult,
} from "../domain";
import { BrowserMediaProbeRepository } from "./media-probe";
import { FfmpegVideoFormatTranscodeRepository } from "./video-format-conversion";

export type BrowserVideoEditorRuntimeConfig =
  | {
      runtimeBaseUrl: string;
      coreURL?: never;
      wasmURL?: never;
    }
  | {
      runtimeBaseUrl?: never;
      coreURL: string;
      wasmURL: string;
    };

export type BrowserVideoEditorRepositories = {
  videoFormatConversionRepository: VideoFormatConversionRepository;
};

export interface VideoFormatConversionRepository {
  convert(command: ConvertVideoFormatCommand): Promise<ConvertVideoFormatResult>;
}

export function createBrowserVideoEditorRepositories(
  config: BrowserVideoEditorRuntimeConfig,
): BrowserVideoEditorRepositories {
  const mediaProbeRepository = new BrowserMediaProbeRepository();
  const mediaTranscodeRepository = new FfmpegVideoFormatTranscodeRepository(config);
  const convertVideoFormatUseCase = new UseCase<ConvertVideoFormatEntity>(
    [
      new CreateVideoFormatConversionPlanRepository(mediaProbeRepository, new CodecCompatibilityRepository()),
      new TranscodeVideoFormatRepository(mediaTranscodeRepository),
    ],
  );

  return {
    videoFormatConversionRepository: {
      convert: async (command) => {
        const entity = await convertVideoFormatUseCase.execute({
          command,
          jobId: command.job?.jobId ?? createJobId("convert"),
        });

        if (!entity.result) {
          throw new Error("Video format conversion did not produce a result.");
        }

        return entity.result;
      },
    },
  };
}

function createJobId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
