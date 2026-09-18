import type { ConvertVideoFormatEntity } from "../entity";
import type { UseCaseRepository } from "../usecase/UseCase";
import { CodecCompatibilityRepository } from "./CodecCompatibilityRepository";
import type { MediaProbeRepository } from "./MediaProbeRepository";

export class CreateVideoFormatConversionPlanRepository implements UseCaseRepository<ConvertVideoFormatEntity> {
  readonly id = "create-video-format-conversion-plan";

  constructor(
    private readonly mediaProbeRepository: MediaProbeRepository,
    private readonly codecCompatibilityRepository: CodecCompatibilityRepository,
  ) {}

  async execute(entity: ConvertVideoFormatEntity): Promise<ConvertVideoFormatEntity> {
    const { command, jobId } = entity;

    command.job?.onProgress?.({ jobId, phase: "probing", ratio: 0 });
    let inputMetadata;

    try {
      inputMetadata = (
        await this.mediaProbeRepository.execute({
          command: {
            source: command.source,
            fileName: command.fileName,
            job: {
              signal: command.job?.signal,
            },
          },
          jobId,
        })
      ).result?.metadata;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
    }

    return this.codecCompatibilityRepository.execute({ ...entity, inputMetadata });
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
