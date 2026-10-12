import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MediaRoutingContext, Repository, RoutableImplementation } from "../../index";
import { UseCase } from "../../index";

type TestEntity = { steps: string[] };

describe("UseCase", () => {
  it("공통 단계와 선택된 구현의 전체 단계만 실행한다", async () => {
    const mobile = createImplementation("mobile", 100, [createStep("mobile-decode"), createStep("mobile-encode")]);
    const desktop = createImplementation("desktop", 50, [createStep("desktop-decode"), createStep("desktop-encode")]);
    const useCase = new UseCase<TestEntity>({
      before: [createStep("probe"), createStep("plan")],
      implementations: [mobile, desktop],
      after: [createStep("validate")],
      contextProviders: [{ collect: () => ({ browser: createBrowserContext({ isMobile: true }) }) }],
    });

    const result = await useCase.execute({ steps: [] });

    assert.deepEqual(result.steps, ["probe", "plan", "mobile-decode", "mobile-encode", "validate"]);
  });

  it("전체 요구사항을 지원하지 않는 구현은 일부 repository도 실행하지 않는다", async () => {
    const incomplete = createImplementation("incomplete", 1_000, [createStep("incomplete-only")], false);
    const complete = createImplementation("complete", 10, [createStep("complete-one"), createStep("complete-two")]);
    const useCase = new UseCase<TestEntity>({ implementations: [incomplete, complete] });

    const result = await useCase.execute({ steps: [] });

    assert.deepEqual(result.steps, ["complete-one", "complete-two"]);
  });

  it("구현 후보가 없는 기존 유즈케이스는 repository를 순서대로 실행한다", async () => {
    const useCase = new UseCase<TestEntity>([createStep("one"), createStep("two")]);

    const result = await useCase.execute({ steps: [] });

    assert.deepEqual(result.steps, ["one", "two"]);
  });
});

function createImplementation(
  name: string,
  score: number,
  repositories: readonly Repository<TestEntity>[],
  supported = true,
): RoutableImplementation<TestEntity> {
  return {
    id: Symbol(name),
    name,
    repositories,
    assess: () => ({ supported, score }),
  };
}

function createStep(name: string): Repository<TestEntity> {
  return { id: name, execute: async (entity) => ({ steps: [...entity.steps, name] }) };
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
