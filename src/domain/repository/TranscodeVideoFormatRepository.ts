import type { ConvertVideoFormatEntity } from "../entity";
import type { UseCaseRepository } from "../usecase/UseCase";
import type { MediaTranscodeRepository } from "./MediaTranscodeRepository";

export class TranscodeVideoFormatRepository implements UseCaseRepository<ConvertVideoFormatEntity> {
  readonly id = "transcode-video-format";

  constructor(private readonly mediaTranscodeRepository: MediaTranscodeRepository) {}

  async execute(entity: ConvertVideoFormatEntity): Promise<ConvertVideoFormatEntity> {
    return this.mediaTranscodeRepository.execute(entity);
  }
}
