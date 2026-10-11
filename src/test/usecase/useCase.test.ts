import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MediaEngineUnsupportedError,
  type MediaRoutingContext,
  type Repository,
  type RoutableRepository,
  UseCase,
} from "../../index";

type TestEntity = {
  steps: string[];
  selected?: string;
};

describe("UseCase", () => {
  it("일반 단계를 실행한 뒤 환경에 맞는 후보 하나를 선택한다", async () => {
    const prepare = createStep("prepare");
    const low = createCandidate("low", ({ browser }) => (browser?.isMobile ? 10 : 50));
    const high = createCandidate("high", ({ browser }) => (browser?.isMobile ? 100 : 20));
    const finish = createStep("finish");
    const useCase = new UseCase<TestEntity>(
      [prepare, low, high, finish],
      [{ collect: () => ({ browser: createBrowserContext({ isMobile: true }) }) }],
    );

    const result = await useCase.execute({ steps: [] });

    assert.deepEqual(result.steps, ["prepare", "high", "finish"]);
    assert.equal(result.selected, "high");
    assert.equal(low.executions, 0);
    assert.equal(high.executions, 1);
  });

  it("우선 후보가 실행 중 지원 불가를 반환하면 다음 후보를 실행한다", async () => {
    const first = createCandidate("first", () => 100, true);
    const second = createCandidate("second", () => 50);
    const useCase = new UseCase<TestEntity>([first, second]);

    const result = await useCase.execute({ steps: [] });

    assert.deepEqual(result.steps, ["second"]);
    assert.equal(first.executions, 1);
    assert.equal(second.executions, 1);
  });

  it("선택 후보가 없으면 기존처럼 모든 repository를 순서대로 실행한다", async () => {
    const useCase = new UseCase<TestEntity>([createStep("one"), createStep("two")]);

    const result = await useCase.execute({ steps: [] });

    assert.deepEqual(result.steps, ["one", "two"]);
  });
});

function createStep(name: string): Repository<TestEntity> {
  return {
    id: name,
    execute: async (entity) => ({ ...entity, steps: [...entity.steps, name] }),
  };
}

function createCandidate(name: string, score: (context: MediaRoutingContext) => number, fail = false) {
  const candidate: RoutableRepository<TestEntity> & { executions: number } = {
    id: name,
    engine: name,
    executions: 0,
    assess: (_entity, context) => ({ supported: true, score: score(context) }),
    execute: async (entity) => {
      candidate.executions += 1;
      if (fail) throw new MediaEngineUnsupportedError(name, "unsupported");
      return { ...entity, selected: name, steps: [...entity.steps, name] };
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
