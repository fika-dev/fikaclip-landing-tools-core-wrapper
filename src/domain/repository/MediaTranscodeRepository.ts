import type { ConvertVideoFormatEntity } from "../entity";
import type { Repository } from "./Repository";

export interface MediaTranscodeRepository extends Repository<ConvertVideoFormatEntity> {}
