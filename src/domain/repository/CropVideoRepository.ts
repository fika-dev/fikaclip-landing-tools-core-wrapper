import type { MediaEditEntity } from "../entity/MediaEditingTypes";
import type { MediaEditRepository } from "./MediaEditRepository";

export interface CropVideoRepository extends MediaEditRepository {
  execute(
    entity: MediaEditEntity & { command: Extract<MediaEditEntity["command"], { operation: "crop" }> },
  ): MediaEditEntity | Promise<MediaEditEntity>;
}
