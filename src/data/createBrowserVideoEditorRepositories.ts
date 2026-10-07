import {
  CodecCompatibilityRepository,
  CreateVideoFormatConversionPlanRepository,
  type ConvertVideoFormatCommand,
  TranscodeVideoFormatRepository,
  UseCase,
  type ConvertVideoFormatEntity,
  type ConvertVideoFormatResult,
} from "../domain";
import { FfmpegRuntime } from "./ffmpeg";
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
  /**
   * Releases the shared runtime, and with it the WebAssembly core and its
   * worker. Whoever called the factory owns this; the repositories cannot do it
   * themselves, because one shared runtime serves all of them.
   */
  dispose(): void;
};

export interface VideoFormatConversionRepository {
  convert(command: ConvertVideoFormatCommand): Promise<ConvertVideoFormatResult>;
}

export function createBrowserVideoEditorRepositories(
  config: BrowserVideoEditorRuntimeConfig,
): BrowserVideoEditorRepositories {
  // One runtime for every repository assembled here: in the browser each one
  // loads its own ~31 MB WebAssembly core into its own worker, so creating them
  // per repository multiplied that cost for no benefit.
  const runtime = new FfmpegRuntime(config);
  const mediaProbeRepository = new BrowserMediaProbeRepository();
  const mediaTranscodeRepository = new FfmpegVideoFormatTranscodeRepository({ runtime });
  const convertVideoFormatUseCase = new UseCase<ConvertVideoFormatEntity>(
    [
      new CreateVideoFormatConversionPlanRepository(mediaProbeRepository, new CodecCompatibilityRepository()),
      new TranscodeVideoFormatRepository(mediaTranscodeRepository),
    ],
  );

  return {
    dispose: () => runtime.terminate(),
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
