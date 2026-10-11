import {
  CodecCompatibilityRepository,
  type ConvertVideoFormatCommand,
  type ConvertVideoFormatEntity,
  type ConvertVideoFormatResult,
  CreateVideoFormatConversionPlanRepository,
  type GetUploadPolicyEntity,
  type GetVideoUploadPolicyCommand,
  type InspectMediaEntity,
  InspectMediaRepository,
  type MediaCommandRuntime,
  type MediaInspectionCommand,
  type MediaInspectionResult,
  ResolveUploadPolicyRepository,
  UploadPolicyRepository,
  UseCase,
  type VideoUploadPolicy,
} from "../domain";
import {
  BrowserNavigatorCapabilityRepository,
  BrowserMediaProbeRepository,
  BrowserRouteContextProvider,
} from "./browser";
import { FfmpegMediaProbeRepository, FfmpegRuntime, FfmpegVideoFormatImplementation } from "./ffmpeg";
import { MediabunnyVideoFormatImplementation } from "./mediabunny";

export type BrowserVideoEditorRuntimeConfig =
  | {
      runtime: MediaCommandRuntime;
      runtimeBaseUrl?: never;
      coreURL?: never;
      wasmURL?: never;
    }
  | {
      runtime?: never;
      runtimeBaseUrl: string;
      coreURL?: never;
      wasmURL?: never;
    }
  | {
      runtime?: never;
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
  getUploadPolicy(command?: GetVideoUploadPolicyCommand): Promise<VideoUploadPolicy>;
  inspect(command: MediaInspectionCommand): Promise<MediaInspectionResult>;
  convert(command: ConvertVideoFormatCommand): Promise<ConvertVideoFormatResult>;
}

export function createBrowserVideoEditorRepositories(
  config: BrowserVideoEditorRuntimeConfig,
): BrowserVideoEditorRepositories {
  // One runtime for every repository assembled here: in the browser each one
  // loads its own ~31 MB WebAssembly core into its own worker, so creating them
  // per repository multiplied that cost for no benefit.
  const createdRuntime = config.runtime === undefined ? new FfmpegRuntime(config) : undefined;
  const runtime: MediaCommandRuntime = config.runtime ?? createdRuntime!;
  const mediaProbeRepository = new FfmpegMediaProbeRepository({
    runtime,
    baseProbeRepository: new BrowserMediaProbeRepository(),
  });
  const capabilityRepository = new BrowserNavigatorCapabilityRepository();
  const getUploadPolicyUseCase = new UseCase<GetUploadPolicyEntity>([
    new ResolveUploadPolicyRepository(capabilityRepository, new UploadPolicyRepository()),
  ]);
  const inspectMediaUseCase = new UseCase<InspectMediaEntity>([new InspectMediaRepository(mediaProbeRepository)]);
  const convertVideoFormatUseCase = new UseCase<ConvertVideoFormatEntity>({
    before: [new CreateVideoFormatConversionPlanRepository(mediaProbeRepository, new CodecCompatibilityRepository())],
    implementations: [new MediabunnyVideoFormatImplementation(), new FfmpegVideoFormatImplementation({ runtime })],
    contextProviders: [new BrowserRouteContextProvider(capabilityRepository)],
  });

  return {
    dispose: () => {
      createdRuntime?.terminate();
    },
    videoFormatConversionRepository: {
      getUploadPolicy: async (command = {}) => {
        const entity = await getUploadPolicyUseCase.execute({ command });
        return requireResult(entity.result, "Upload policy use case did not produce a result.");
      },
      inspect: async (command) => {
        const entity = await inspectMediaUseCase.execute({
          command,
          jobId: command.job?.jobId ?? createJobId("inspect"),
        });
        return requireResult(entity.result, "Media inspection use case did not produce a result.");
      },
      convert: async (command) => {
        const entity = await convertVideoFormatUseCase.execute({
          command,
          jobId: command.job?.jobId ?? createJobId("convert"),
        });

        return requireResult(entity.result, "Video format conversion did not produce a result.");
      },
    },
  };
}

function requireResult<Result>(result: Result | undefined, message: string): Result {
  if (!result) throw new Error(message);
  return result;
}

function createJobId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
