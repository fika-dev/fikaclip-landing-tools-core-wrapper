import type { GetUploadPolicyEntity } from "../entity";
import type { UseCaseRepository } from "../usecase/UseCase";
import type { BrowserCapabilityRepository } from "./BrowserCapabilityRepository";
import { UploadPolicyRepository } from "./UploadPolicyRepository";

export class ResolveUploadPolicyRepository implements UseCaseRepository<GetUploadPolicyEntity> {
  readonly id = "resolve-upload-policy";

  constructor(
    private readonly capabilityRepository: BrowserCapabilityRepository,
    private readonly uploadPolicyRepository: UploadPolicyRepository,
  ) {}

  async execute(entity: GetUploadPolicyEntity): Promise<GetUploadPolicyEntity> {
    const capabilityEntity = await this.capabilityRepository.execute({});
    return this.uploadPolicyRepository.execute({ ...entity, capability: capabilityEntity.result });
  }
}
