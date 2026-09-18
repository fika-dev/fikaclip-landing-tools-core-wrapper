import type { InspectMediaEntity } from "../entity";
import type { UseCaseRepository } from "../usecase/UseCase";
import type { MediaProbeRepository } from "./MediaProbeRepository";

export class InspectMediaRepository implements UseCaseRepository<InspectMediaEntity> {
  readonly id = "inspect-media";

  constructor(private readonly mediaProbeRepository: MediaProbeRepository) {}

  async execute(entity: InspectMediaEntity): Promise<InspectMediaEntity> {
    return this.mediaProbeRepository.execute(entity);
  }
}
