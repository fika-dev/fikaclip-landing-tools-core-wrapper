import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type InspectMediaEntity, InspectMediaUseCase, type Repository } from "../../index";

describe("미디어 정보 조회 유즈케이스", () => {
  it("기존 조회 레포지토리 결과를 외부에 반환한다", async () => {
    const repository: Repository<InspectMediaEntity> = {
      id: "inspection-stub",
      execute: async (entity) => ({
        ...entity,
        result: {
          fileName: "sample.mp4",
          metadata: { durationSeconds: 12, frameRate: 29.97 },
          format: "mp4",
          videoCodec: "h264",
        },
      }),
    };
    const useCase = new InspectMediaUseCase(repository);

    const result = await useCase.execute({
      source: { type: "blob", blob: new Blob() },
      fileName: "sample.mp4",
    });

    assert.equal(result.fileName, "sample.mp4");
    assert.equal(result.metadata.frameRate, 29.97);
  });

  it("호출자가 전달한 작업 ID를 레포지토리에 전달한다", async () => {
    let receivedJobId: string | undefined;
    const repository: Repository<InspectMediaEntity> = {
      id: "job-id-stub",
      execute: async (entity) => {
        receivedJobId = entity.jobId;
        return { ...entity, result: { metadata: {} } };
      },
    };
    const useCase = new InspectMediaUseCase(repository);

    await useCase.execute({
      source: { type: "blob", blob: new Blob() },
      job: { jobId: "inspect-job" },
    });

    assert.equal(receivedJobId, "inspect-job");
  });

  it("레포지토리가 결과를 만들지 않으면 실패한다", async () => {
    const repository: Repository<InspectMediaEntity> = {
      id: "empty-stub",
      execute: async (entity) => entity,
    };
    const useCase = new InspectMediaUseCase(repository);

    await assert.rejects(
      () => useCase.execute({ source: { type: "blob", blob: new Blob() } }),
      /Media inspection did not produce a result/,
    );
  });
});
