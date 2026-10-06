import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AudioVolumeSegment } from "../../index";
import { adjustSampleVolume, loadCodecSampleMatrix } from "../support";

const MATRIX = loadCodecSampleMatrix("webm");

const HALF_VOLUME: AudioVolumeSegment[] = [{ startSeconds: 0, endSeconds: 1, volume: 0.5 }];

/**
 * WebM has no valid volume-adjustment combination today.
 *
 * The operation hardcodes `-c:a aac` without consulting the container, exactly
 * as add-audio does, so the WebM muxer rejects every output. These cases record
 * that; when the repository learns to pick a container-legal encoder — Opus for
 * WebM, which `CodecCompatibilityRepository` already knows — they will start
 * failing, and that is the signal to turn them into success assertions.
 */
describe("webm 컨테이너 오디오 볼륨 조절", () => {
  describe("현재 동작 기록: WebM 먹서가 AAC 를 거부해 모든 조절이 실패한다", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스의 볼륨 조절이 실패한다`, async () => {
        await assert.rejects(
          () => adjustSampleVolume({ sample, segments: HALF_VOLUME }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /ffmpeg adjust-volume failed with exit code \d+\./);
            assert.match(error.message, /-c:a aac/);
            assert.match(error.message, /supported for WebM/);
            return true;
          },
        );
      });
    }
  });
});
