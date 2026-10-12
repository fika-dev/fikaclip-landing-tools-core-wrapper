import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMediaProgressReporter, type MediaToolProgress } from "../../index";

describe("미디어 작업 진행률", () => {
  it("단계 진행률을 전체 진행률과 남은 비율로 환산한다", () => {
    const events: MediaToolProgress[] = [];
    const reporter = createMediaProgressReporter(
      { onProgress: (event) => events.push(event) },
      "progress-test",
      [
        { phase: "loading", weight: 0.1 },
        { phase: "decoding", weight: 0.4 },
        { phase: "muxing", weight: 0.5 },
      ],
    );

    reporter.report("decoding", 0.5);

    assert.equal(events[0].phaseRatio, 0.5);
    assert.ok(Math.abs((events[0].overallRatio ?? 0) - 0.3) < Number.EPSILON);
    assert.ok(Math.abs((events[0].ratio ?? 0) - 0.3) < Number.EPSILON);
    assert.ok(Math.abs((events[0].remainingRatio ?? 0) - 0.7) < Number.EPSILON);
    assert.equal(typeof events[0].elapsedSeconds, "number");
    assert.equal(typeof events[0].estimatedRemainingSeconds, "number");
  });

  it("늦게 도착한 이벤트가 전체 진행률을 뒤로 돌리지 않는다", () => {
    const events: MediaToolProgress[] = [];
    const reporter = createMediaProgressReporter(
      { onProgress: (event) => events.push(event) },
      "monotonic-test",
      [
        { phase: "decoding", weight: 0.5 },
        { phase: "muxing", weight: 0.5 },
      ],
    );

    reporter.report("muxing", 0.5);
    reporter.report("decoding", 1);
    reporter.done();

    assert.deepEqual(events.map((event) => event.overallRatio), [0.75, 0.75, 1]);
    assert.equal(events.at(-1)?.remainingRatio, 0);
    assert.equal(events.at(-1)?.estimatedRemainingSeconds, 0);
  });
});
