import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertMediaOutput, loadCodecSampleMatrix, muteSample, toProbeVideoCodecName } from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");

const EXPECTED_MIME_TYPE = "video/webm";

/**
 * WebM is where the two muting paths diverge, which makes this the clearest
 * demonstration of what the hardcoded AAC actually costs.
 *
 * `muteAll` passes `-an`: no audio stream is written, so no audio codec is
 * negotiated and the container has nothing to object to. Segment muting writes
 * an AAC stream, which WebM's profile forbids. Same operation, same source, and
 * the only difference is whether an audio codec was chosen at all.
 */
describe("webm 컨테이너 오디오 음소거", () => {
  describe("전체 음소거 (-an) — 유효한 조합", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스에서 오디오 스트림이 사라진다`, async () => {
        // No audio codec is involved, so WebM's Opus/Vorbis-only rule never
        // comes into play and the operation succeeds.
        const outcome = await muteSample({ sample, muteAll: true });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: null,
          durationSeconds: 1,
        });
      });
    }
  });

  describe("현재 동작 기록: 구간 음소거는 AAC 재인코딩 때문에 실패한다", () => {
    const segmentCases = [
      { label: "전체 구간", segments: [{ startSeconds: 0, endSeconds: 1 }] },
      { label: "절반 구간", segments: [{ startSeconds: 0, endSeconds: 0.5 }] },
      { label: "빈 구간", segments: [] },
    ];

    for (const { label, segments } of segmentCases) {
      it(`${label} 음소거가 '-c:a aac' 하드코딩 때문에 실패한다`, async () => {
        await assert.rejects(
          () => muteSample({ sample: PINNED_SAMPLE, segments }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /ffmpeg mute failed with exit code \d+\./);
            assert.match(error.message, /-c:a aac/);
            assert.match(error.message, /supported for WebM/);
            return true;
          },
        );
      });
    }
  });
});
