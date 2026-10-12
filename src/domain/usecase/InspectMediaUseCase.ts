import type { MediaInspectionCommand, MediaInspectionResult } from "../entity";
import type { MediaProbeRepository } from "../repository";

export class InspectMediaUseCase {
  constructor(private readonly repository: MediaProbeRepository) {}

  async execute(command: MediaInspectionCommand): Promise<MediaInspectionResult> {
    const entity = await this.repository.execute({
      command,
      jobId: command.job?.jobId ?? createJobId(),
    });

    if (!entity.result) {
      throw new Error("Media inspection did not produce a result.");
    }

    return entity.result;
  }
}

function createJobId() {
  return `inspect-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
