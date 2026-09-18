import type { BrowserCapabilitySnapshot, GetUploadPolicyEntity, VideoUploadPolicy, VideoUploadPolicyOperation } from "../entity";
import type { Repository } from "./Repository";

const ONE_MIB = 1024 * 1024;
const UPLOAD_POLICY_FIXED_BYTES = 500 * ONE_MIB;
const UPLOAD_POLICY_MIN_BYTES = 64 * ONE_MIB;
const UPLOAD_POLICY_MAX_BY_OPERATION: Record<VideoUploadPolicyOperation, number> = {
  inspect: UPLOAD_POLICY_FIXED_BYTES,
  remux: UPLOAD_POLICY_FIXED_BYTES,
  transcode: UPLOAD_POLICY_FIXED_BYTES,
  "heavy-transcode": UPLOAD_POLICY_FIXED_BYTES,
};

export class UploadPolicyRepository implements Repository<GetUploadPolicyEntity> {
  readonly id = "upload-policy";

  execute(entity: GetUploadPolicyEntity): GetUploadPolicyEntity {
    const operation = entity.command.operation ?? "transcode";
    const capability = entity.capability;

    if (!capability) {
      throw new Error("Upload policy repository requires browser capability.");
    }

    const reasons: string[] = [];
    const maxFileSizeBytes = UPLOAD_POLICY_FIXED_BYTES;
    reasons.push("A fixed 500MB limit is used for upload and browser conversion.");

    if (capability.deviceMemoryGb) {
      reasons.push(`Device memory hint: ${capability.deviceMemoryGb}GB.`);
    } else {
      reasons.push("Device memory is unavailable, so a conservative browser limit is used.");
    }

    if (capability.cpuCores) {
      reasons.push(`CPU concurrency hint: ${capability.cpuCores} logical cores.`);
    }

    if (capability.isMobile) {
      reasons.push("Mobile browser detected; fixed limit still applies.");
    }

    if (capability.isLikelyInAppBrowser) {
      reasons.push("In-app browser detected; fixed limit still applies.");
    }

    if (capability.availableStorageBytes && capability.availableStorageBytes < maxFileSizeBytes * 3) {
      reasons.push("Available browser storage estimate is low, but the fixed limit is preserved.");
    }

    return {
      ...entity,
      result: {
        maxFileSizeBytes: this.clampLimit(maxFileSizeBytes, operation),
        minFileSizeBytes: UPLOAD_POLICY_MIN_BYTES,
        operation,
        confidence: this.resolveConfidence(capability),
        environment: capability,
        reasons,
      },
    };
  }

  private clampLimit(limitBytes: number, operation: VideoUploadPolicyOperation) {
    return (
      Math.round(
        Math.max(UPLOAD_POLICY_MIN_BYTES, Math.min(UPLOAD_POLICY_MAX_BY_OPERATION[operation], limitBytes)) / ONE_MIB,
      ) * ONE_MIB
    );
  }

  private resolveConfidence(capability: BrowserCapabilitySnapshot): VideoUploadPolicy["confidence"] {
    if (capability.isLikelyInAppBrowser || !capability.isDeviceMemorySupported) {
      return capability.isStorageEstimateSupported ? "medium" : "low";
    }

    return capability.isStorageEstimateSupported ? "high" : "medium";
  }
}
