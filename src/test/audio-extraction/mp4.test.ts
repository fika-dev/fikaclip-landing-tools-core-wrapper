import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertMediaOutput, extractSampleAudio, loadCodecSampleMatrix } from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

/**
 * Audio extraction is the one operation whose output container is independent
 * of the source's, so the source container imposes no codec constraint here.
 *
 * Each audio format implies a codec: the repository picks MP3 for `.mp3`, Opus
 * for `.ogg`, and AAC for everything else.
 */
const VALID_FORMATS = [
  { format: "mp3", expectedCodec: "mp3", mimeType: "audio/mpeg" },
  { format: "m4a", expectedCodec: "aac", mimeType: "audio/mp4" },
  { format: "ogg", expectedCodec: "opus", mimeType: "audio/ogg" },
] as const;

describe("mp4 소스에서 오디오 추출", () => {
  describe("포맷별 기본 코덱", () => {
    for (const { format, expectedCodec, mimeType } of VALID_FORMATS) {
      it(`${format} 로 추출하면 ${expectedCodec} 오디오만 남는다`, async () => {
        const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format });

        assertMediaOutput(outcome, {
          container: format,
          mimeType,
          // `-vn` drops the video entirely.
          videoCodec: null,
          audioCodec: expectedCodec,
          audible: true,
          channels: 2,
          durationSeconds: 1,
        });
      });
    }
  });

  describe("오디오 코덱을 직접 지정", () => {
    it("m4a 에 aac 를 명시해도 기본값과 같은 결과가 나온다", async () => {
      const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format: "m4a", audioCodec: "aac" });

      assertMediaOutput(outcome, {
        container: "m4a",
        mimeType: "audio/mp4",
        videoCodec: null,
        audioCodec: "aac",
        audible: true,
      });
    });

    it("m4a 는 mp3 를 거부한다 — 확장자가 먹서를 가른다", async () => {
      // `.m4a` selects ffmpeg's `ipod` muxer, a restricted ISO BMFF profile with
      // a codec whitelist, while `.mp4` selects the general `mp4` muxer which
      // does carry MP3. Same base container format, different muxer, different
      // codec policy — and `AudioFormat` offers no plain `.mp4` audio option, so
      // MP3 extraction has to go to `.mp3`.
      await assert.rejects(
        () => extractSampleAudio({ sample: PINNED_SAMPLE, format: "m4a", audioCodec: "mp3" }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /ffmpeg extract-audio failed with exit code \d+\./);
          assert.match(error.message, /codec not currently supported in container/);
          return true;
        },
      );
    });

    it("오디오 트랙 번호를 지정해도 첫 트랙이 추출된다", async () => {
      // The fixtures carry a single audio track, so index 0 is the only valid
      // selection; this pins that `-map 0:a:0` is wired correctly.
      const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format: "m4a", audioTrackIndex: 0 });

      assertMediaOutput(outcome, {
        container: "m4a",
        mimeType: "audio/mp4",
        videoCodec: null,
        audioCodec: "aac",
        audible: true,
      });
    });
  });

  describe("소스 오디오 코덱별로 m4a 추출", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.audioCodec} 소스에서 aac 로 추출된다`, async () => {
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
    it("wav 로 추출하면 PCM 이 아니라 AAC 가 담겨 재생 불가가 된다", async () => {
      // `defaultAudioCodec` returns AAC for every format except mp3 and ogg, so
      // `.wav` gets AAC. The WAV muxer accepts it — WAV carries a codec tag, not
      // a fixed format — but the result decodes with errors and no player will
      // handle it. WAV should carry PCM, and the domain's `AudioCodec` cannot
      // even express PCM today, so the format has no correct option at all.
      const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format: "wav" });

      assert.equal(outcome.profile.container, "wav");
      assert.equal(outcome.profile.audioCodec, "aac", "AAC inside a WAV container is the defect");
      assert.equal(outcome.resultMimeType, "audio/wav");
      // Decoding fails outright, so no loudness can be measured at all. A merely
      // silent file would still report a number here.
      assert.equal(outcome.loudness.meanVolumeDb, null, "the output must be undecodable");
    });
  });
});
