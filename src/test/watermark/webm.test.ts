import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCodecSampleMatrix, watermarkSample } from "../support";

const MATRIX = loadCodecSampleMatrix("webm");

/**
 * WebM watermarking has no valid combination at all — not even in principle.
 *
 * Cropping at least lets the caller pass `output.videoCodec`, so WebM works
 * there once VP8 or VP9 is requested. Watermarking hardcodes `-c:v libx264`
 * with no option to override it, and H.264 is outside WebM's profile, so every
 * WebM input fails and no argument can rescue it.
 *
 * This is the one operation where the fix cannot be "pick a better default" —
 * the command needs an output codec field it does not currently have.
 */
describe("webm 컨테이너 워터마크", () => {
  describe("현재 동작 기록: 유효한 조합이 존재하지 않는다", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스의 워터마크가 실패한다`, async () => {
        await assert.rejects(
          () => watermarkSample({ sample }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /ffmpeg watermark failed with exit code \d+\./);
            // The video encoder is the problem, and it is not configurable.
            assert.match(error.message, /-c:v libx264/);
            assert.match(error.message, /supported for WebM/);
            return true;
          },
        );
      });
    }
  });

  describe("오디오는 복사되므로 오디오 쪽은 원인이 아니다", () => {
    it("opus 소스와 vorbis 소스가 동일한 비디오 코덱 오류로 실패한다", async () => {
      // `-c:a copy` keeps whatever the source had, and both Opus and Vorbis are
      // in WebM's profile. Identical failures across both prove the audio
      // stream is not involved.
      for (const audioCodec of ["opus", "vorbis"]) {
        const sample = MATRIX.all.find((candidate) => candidate.audioCodec === audioCodec);
        assert.ok(sample, `missing a ${audioCodec} sample`);

        await assert.rejects(() => watermarkSample({ sample }), /-c:v libx264/);
      }
    });
  });
});
