import type { BrowserCapabilityEntity, BrowserCapabilityRepository, BrowserCapabilitySnapshot } from "../../domain";

type NavigatorWithOptionalHints = Navigator & {
  deviceMemory?: number;
  userAgentData?: {
    mobile?: boolean;
  };
};

export class BrowserNavigatorCapabilityRepository implements BrowserCapabilityRepository {
  readonly id = "browser-navigator-capability";

  async execute(entity: BrowserCapabilityEntity = {}): Promise<BrowserCapabilityEntity> {
    const result = await this.createSnapshot();

    return { ...entity, result };
  }

  private async createSnapshot(): Promise<BrowserCapabilitySnapshot> {
    if (typeof navigator === "undefined") {
      return {
        isMobile: false,
        isLikelyInAppBrowser: false,
        isStorageEstimateSupported: false,
        isDeviceMemorySupported: false,
      };
    }

    const nav = navigator as NavigatorWithOptionalHints;
    const userAgent = nav.userAgent ?? "";
    const storageEstimate = await this.getStorageEstimate();

    return {
      deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
      cpuCores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
      availableStorageBytes:
        typeof storageEstimate?.quota === "number" && typeof storageEstimate.usage === "number"
          ? Math.max(0, storageEstimate.quota - storageEstimate.usage)
          : undefined,
      isMobile: nav.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent),
      isLikelyInAppBrowser: detectLikelyInAppBrowser(userAgent),
      isStorageEstimateSupported: Boolean(navigator.storage?.estimate),
      isDeviceMemorySupported: typeof nav.deviceMemory === "number",
    };
  }

  private async getStorageEstimate() {
    if (!navigator.storage?.estimate) {
      return undefined;
    }

    return navigator.storage.estimate().catch(() => undefined);
  }
}

function detectLikelyInAppBrowser(userAgent: string) {
  return /FBAN|FBAV|Instagram|KAKAOTALK|NAVER|Line\/|wv\)|WebView|DaumApps|Twitter|MicroMessenger/i.test(userAgent);
}
