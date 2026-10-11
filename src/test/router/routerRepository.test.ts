import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ConvertVideoFormatEntity,
  MediaEngineUnsupportedError,
  type MediaRoutingContext,
  type RoutableRepository,
  type RouteAssessment,
  RouterRepository,
} from "../../index";

describe("RouterRepository", () => {
  it("환경을 모아서 가장 높은 점수를 준 repository를 실행한다", async () => {
    const lower = createCandidate("lower", ({ browser }) => ({
      supported: true,
      score: browser?.isMobile ? 10 : 30,
    }));
    const higher = createCandidate("higher", ({ browser }) => ({
      supported: true,
      score: browser?.isMobile ? 40 : 20,
    }));
    const router = new RouterRepository<ConvertVideoFormatEntity>(
      [
        {
          collect: () => ({ browser: createBrowserContext({ isMobile: true }) }),
        },
      ],
      [lower, higher],
    );

    const result = await router.execute(createEntity());

    assert.equal(result.result?.details.engine, "higher");
    assert.equal(lower.executions, 0);
    assert.equal(higher.executions, 1);
  });

  it("선택한 구현이 지원 불가를 알리면 다음 후보를 실행한다", async () => {
    const unsupported = createCandidate("preferred", () => ({ supported: true, score: 100 }), true);
    const fallback = createCandidate("fallback", () => ({ supported: true, score: 50 }));
    const router = new RouterRepository<ConvertVideoFormatEntity>([], [unsupported, fallback]);

    const result = await router.execute(createEntity());

    assert.equal(result.result?.details.engine, "fallback");
    assert.equal(unsupported.executions, 1);
    assert.equal(fallback.executions, 1);
  });

  it("지원하지 않는 후보는 실행하지 않는다", async () => {
    const skipped = createCandidate("skipped", () => ({ supported: false, score: 1_000 }));
    const selected = createCandidate("selected", () => ({ supported: true, score: 1 }));
    const router = new RouterRepository<ConvertVideoFormatEntity>([], [skipped, selected]);

    await router.execute(createEntity());

    assert.equal(skipped.executions, 0);
    assert.equal(selected.executions, 1);
  });
});

function createCandidate(
  engine: string,
  assess: (context: MediaRoutingContext) => RouteAssessment,
  failUnsupported = false,
) {
  const candidate: RoutableRepository<ConvertVideoFormatEntity> & { executions: number } = {
    id: `${engine}-candidate`,
    engine,
    executions: 0,
    assess: (_entity, context) => assess(context),
    execute: async (entity) => {
      candidate.executions += 1;
      if (failUnsupported) throw new MediaEngineUnsupportedError(engine, "unsupported");

      return {
        ...entity,
        result: {
          blob: new Blob(),
          fileName: "output.webm",
          mimeType: "video/webm",
          sizeBytes: 0,
          details: { ...entity.plan!, engine },
        },
      };
    },
  };

  return candidate;
}

function createBrowserContext(overrides: Partial<MediaRoutingContext["browser"]> = {}) {
  return {
    isMobile: false,
    isLikelyInAppBrowser: false,
    isStorageEstimateSupported: false,
    isDeviceMemorySupported: false,
    webCodecs: {
      isVideoEncoderSupported: true,
      isAudioEncoderSupported: true,
    },
    ...overrides,
  };
}

function createEntity(): ConvertVideoFormatEntity {
  return {
    command: {
      source: { type: "blob", blob: new Blob() },
      output: { format: "webm" },
    },
    jobId: "router-test",
    plan: {
      mode: "transcode",
      output: { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
      warnings: [],
    },
  };
}
