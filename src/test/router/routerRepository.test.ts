import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MediaEngineUnsupportedError,
  type MediaRoutingContext,
  type Repository,
  type RoutableImplementation,
  type RouteAssessment,
  RouterRepository,
} from "../../index";

type TestEntity = { steps: string[] };

describe("RouterRepository", () => {
  it("환경을 모아서 가장 높은 점수의 구현 전체를 실행한다", async () => {
    const lower = createImplementation("lower", ({ browser }) => ({
      supported: true,
      score: browser?.isMobile ? 10 : 30,
    }));
    const higher = createImplementation(
      "higher",
      ({ browser }) => ({ supported: true, score: browser?.isMobile ? 40 : 20 }),
      [createStep("high-one"), createStep("high-two")],
    );
    const router = new RouterRepository<TestEntity>(
      [{ collect: () => ({ browser: createBrowserContext({ isMobile: true }) }) }],
      [lower, higher],
    );

    const result = await router.execute({ steps: [] });

    assert.deepEqual(result.steps, ["high-one", "high-two"]);
    assert.equal(lower.executions(), 0);
    assert.equal(higher.executions(), 2);
  });

  it("지원 불가 fallback은 다음 구현을 원래 entity부터 실행한다", async () => {
    const unsupported = createImplementation("preferred", () => ({ supported: true, score: 100 }), [
      createStep("partial"),
      createUnsupportedStep("preferred"),
    ]);
    const fallback = createImplementation("fallback", () => ({ supported: true, score: 50 }), [
      createStep("fallback-one"),
      createStep("fallback-two"),
    ]);
    const router = new RouterRepository<TestEntity>([], [unsupported, fallback]);

    const result = await router.execute({ steps: ["before"] });

    assert.deepEqual(result.steps, ["before", "fallback-one", "fallback-two"]);
  });

  it("전체 작업을 지원하지 않는 구현은 실행하지 않는다", async () => {
    const skipped = createImplementation("skipped", () => ({ supported: false, score: 1_000 }));
    const selected = createImplementation("selected", () => ({ supported: true, score: 1 }));
    const router = new RouterRepository<TestEntity>([], [skipped, selected]);

    await router.execute({ steps: [] });

    assert.equal(skipped.executions(), 0);
    assert.equal(selected.executions(), 1);
  });
});

function createImplementation(
  name: string,
  assess: (context: MediaRoutingContext) => RouteAssessment,
  sourceRepositories: readonly Repository<TestEntity>[] = [createStep(name)],
) {
  let executionCount = 0;
  const repositories = sourceRepositories.map((repository) => ({
    ...repository,
    execute: async (entity: TestEntity) => {
      executionCount += 1;
      return repository.execute(entity);
    },
  }));
  const implementation: RoutableImplementation<TestEntity> & { executions(): number } = {
    id: Symbol(name),
    name,
    repositories,
    executions: () => executionCount,
    assess: (_entity, context) => assess(context),
  };
  return implementation;
}

function createStep(name: string): Repository<TestEntity> {
  return { id: name, execute: async (entity) => ({ steps: [...entity.steps, name] }) };
}

function createUnsupportedStep(name: string): Repository<TestEntity> {
  return {
    id: `${name}-unsupported`,
    execute: async () => {
      throw new MediaEngineUnsupportedError(name, "unsupported");
    },
  };
}

function createBrowserContext(overrides: Partial<MediaRoutingContext["browser"]> = {}) {
  return {
    isMobile: false,
    isLikelyInAppBrowser: false,
    isStorageEstimateSupported: false,
    isDeviceMemorySupported: false,
    webCodecs: { isVideoEncoderSupported: true, isAudioEncoderSupported: true },
    ...overrides,
  };
}
