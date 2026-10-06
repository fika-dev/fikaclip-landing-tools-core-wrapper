import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertMediaOutput, extractSampleAudio, loadCodecSampleMatrix } from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");

/**
 * The only operation where WebM sources have valid combinations today.
 *
 * Every other operation writes back into the source's container, so WebM's
 * Opus/Vorbis-only rule collides with the hardcoded AAC. Extraction writes an
 * audio-only container chosen by the caller, so WebM's profile never applies to
 * the output — a WebM source extracts to AAC in an MP4-family container without
 * complaint.
 */
const VALID_FORMATS = [
  { format: "mp3", expectedCodec: "mp3", mimeType: "audio/mpeg" },
  { format: "m4a", expectedCodec: "aac", mimeType: "audio/mp4" },
  { format: "ogg", expectedCodec: "opus", mimeType: "audio/ogg" },
] as const;

describe("webm 소스에서 오디오 추출", () => {
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
        // Vorbis sources are decoded here even though Vorbis is not something
        // the library can write: decoding and encoding are separate capabilities.
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

  describe("ogg 로 추출하면 소스 코덱이 그대로 유지될 수 있다", () => {
    it("opus 소스를 ogg/opus 로 추출한다", async () => {
      // The only source/output pairing in the whole matrix where the audio codec
      // happens to match — though the repository still re-encodes rather than
      // copying, because `extract-audio` never considers a stream copy.
      const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format: "ogg", audioCodec: "opus" });

      assertMediaOutput(outcome, {
        container: "ogg",
        mimeType: "audio/ogg",
        videoCodec: null,
        audioCodec: "opus",
        audible: true,
      });
    });
  });

  describe("현재 동작 기록: wav 추출물은 디코딩되지 않는다", () => {
    it("wav 로 추출하면 PCM 이 아니라 AAC 가 담겨 재생 불가가 된다", async () => {
      const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format: "wav" });

      assert.equal(outcome.profile.container, "wav");
      assert.equal(outcome.profile.audioCodec, "aac", "AAC inside a WAV container is the defect");
      assert.equal(outcome.loudness.meanVolumeDb, null, "the output must be undecodable");
    });
  });
});
