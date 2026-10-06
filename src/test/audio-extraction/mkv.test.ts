import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertMediaOutput, extractSampleAudio, loadCodecSampleMatrix } from "../support";

const MATRIX = loadCodecSampleMatrix("mkv");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

/**
 * MKV sources cover the widest range of input audio codecs — AAC, Opus and
 * FLAC — which makes this the broadest test of the decode side. FLAC is
 * lossless and, like PCM, cannot be preserved on output.
 */
const VALID_FORMATS = [
  { format: "mp3", expectedCodec: "mp3", mimeType: "audio/mpeg" },
  { format: "m4a", expectedCodec: "aac", mimeType: "audio/mp4" },
  { format: "ogg", expectedCodec: "opus", mimeType: "audio/ogg" },
] as const;

describe("mkv 소스에서 오디오 추출", () => {
  describe("포맷별 기본 코덱", () => {
    for (const { format, expectedCodec, mimeType } of VALID_FORMATS) {
      it(`${format} 로 추출하면 ${expectedCodec} 오디오만 남는다`, async () => {
        const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format });

        assertMediaOutput(outcome, {
          container: format,
          mimeType,
          videoCodec: null,
          audioCodec: expectedCodec,
          audible: true,
          channels: 2,
          durationSeconds: 1,
        });
      });
    }
  });

  describe("소스 오디오 코덱별로 m4a 추출", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.audioCodec} 소스에서 aac 로 추출된다`, async () => {
        // FLAC sources decode fine even though FLAC is not writable here, and
        // the extraction is necessarily lossy as a result.
        const outcome = await extractSampleAudio({ sample, format: "m4a" });

        assertMediaOutput(outcome, {
          container: "m4a",
          mimeType: "audio/mp4",
          videoCodec: null,
          audioCodec: "aac",
          audible: true,
          durationSeconds: 1,
        });
      });
    }
  });

  describe("현재 동작 기록: wav 추출물은 디코딩되지 않는다", () => {
    it("FLAC 소스를 wav 로 추출해도 AAC 가 담겨 재생 불가가 된다", async () => {
      const flacSample = MATRIX.get("h264", "flac");
      const outcome = await extractSampleAudio({ sample: flacSample, format: "wav" });

      assert.equal(outcome.profile.container, "wav");
      assert.equal(outcome.profile.audioCodec, "aac", "AAC inside a WAV container is the defect");
      assert.equal(outcome.loudness.meanVolumeDb, null, "the output must be undecodable");
    });
  });
});
