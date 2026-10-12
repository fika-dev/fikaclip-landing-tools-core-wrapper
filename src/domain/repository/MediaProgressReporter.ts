import type {
  MediaToolJobOptions,
  MediaToolProgress,
  MediaToolProgressPhase,
} from "../entity/MediaToolTypes";

export type MediaProgressStage = {
  phase: MediaToolProgressPhase;
  weight: number;
};

export type MediaProgressReporter = {
  report(phase: MediaToolProgressPhase, phaseRatio: number, message?: string): void;
  done(message?: string): void;
};

export function createMediaProgressReporter(
  job: MediaToolJobOptions | undefined,
  jobId: string,
  stages: readonly MediaProgressStage[],
): MediaProgressReporter {
  const startedAt = now();
  const totalWeight = stages.reduce((sum, stage) => sum + Math.max(0, stage.weight), 0) || 1;
  let lastOverallRatio = 0;

  const emit = (phase: MediaToolProgressPhase, phaseRatio: number, message?: string) => {
    const stageIndex = stages.findIndex((stage) => stage.phase === phase);
    const completedWeight = stages
      .slice(0, Math.max(0, stageIndex))
      .reduce((sum, stage) => sum + Math.max(0, stage.weight), 0);
    const stageWeight = stageIndex >= 0 ? Math.max(0, stages[stageIndex].weight) : 0;
    const normalizedPhaseRatio = clamp(phaseRatio);
    const calculatedRatio = stageIndex >= 0 ? (completedWeight + stageWeight * normalizedPhaseRatio) / totalWeight : lastOverallRatio;
    const overallRatio = Math.max(lastOverallRatio, clamp(calculatedRatio));
    lastOverallRatio = overallRatio;
    const elapsedSeconds = Math.max(0, (now() - startedAt) / 1000);
    const estimatedRemainingSeconds =
      overallRatio > 0 && overallRatio < 1 ? (elapsedSeconds / overallRatio) * (1 - overallRatio) : undefined;
    const progress: MediaToolProgress = {
      jobId,
      phase,
      ratio: overallRatio,
      phaseRatio: normalizedPhaseRatio,
      overallRatio,
      remainingRatio: 1 - overallRatio,
      elapsedSeconds,
      estimatedRemainingSeconds,
      message,
    };
    job?.onProgress?.(progress);
  };

  return {
    report: emit,
    done: (message) => {
      lastOverallRatio = 1;
      const elapsedSeconds = Math.max(0, (now() - startedAt) / 1000);
      job?.onProgress?.({
        jobId,
        phase: "done",
        ratio: 1,
        phaseRatio: 1,
        overallRatio: 1,
        remainingRatio: 0,
        elapsedSeconds,
        estimatedRemainingSeconds: 0,
        message,
      });
    },
  };
}

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
