import type { EditVideoAspectRatioEntity } from "../entity/VideoAspectRatioTypes";
import type { UseCaseRepository } from "../usecase/UseCase";
import type { VideoAspectRatioRepository } from "./VideoAspectRatioRepository";

export class TransformVideoAspectRatioRepository implements UseCaseRepository<EditVideoAspectRatioEntity> {
  readonly id = "transform-video-aspect-ratio";

  constructor(private readonly videoAspectRatioRepository: VideoAspectRatioRepository) {}

  execute(entity: EditVideoAspectRatioEntity) {
    return this.videoAspectRatioRepository.execute(entity);
  }
}
