import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  assertExtractedAudioPlays,
  extractSampleAudio,
  loadCodecSampleMatrix,
  measureSample,
  type CodecSampleVideo,
  type SampleMeasurement,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

/**
 * The audio formats that can be extracted, and the codec each one implies.
 *
 * The repository picks the codec from the format: MP3 for `.mp3`, Opus for
 * `.ogg`, AAC for anything else. `.wav` is therefore broken by construction and
 * is recorded separately below.
 */
const PLAYABLE_FORMATS = [
  { format: "mp3", audioCodec: "mp3", mimeType: "audio/mpeg", container: "mp3" },
  { format: "m4a", audioCodec: "aac", mimeType: "audio/mp4", container: "m4a" },
  { format: "ogg", audioCodec: "opus", mimeType: "audio/ogg", container: "ogg" },
] as const;

/**
 * Audio extraction is the one operation whose output container is independent of
 * the source's, so a mp4 source is not constrained by mp4's
 * codec rules here — only by what the chosen audio format accepts.
 *
 * MP4 sources cover AAC, MP3 and Opus input, so this is the broadest sweep of
 * the decode side.
 */
describe("mp4 소스에서 오디오 추출", () => {
  const measurements = new Map<string, SampleMeasurement>();

  before(async () => {
    // Playability is judged against the source: same duration, same sample rate,
    // same channel count, same level. All of that needs the source measured.
    for (const sample of MATRIX.withVideo("h264")) {
      measurements.set(sample.fileName, await measureSample(sample));
    }
  });

  const sourceOf = (sample: CodecSampleVideo) => {
    const measurement = measurements.get(sample.fileName);
    assert.ok(measurement, `missing a measurement for ${sample.fileName}`);
    return measurement;
  };

  describe("추출 포맷별 — 실제 재생 가능한 파일이 나온다", () => {
    for (const { format, audioCodec, mimeType, container } of PLAYABLE_FORMATS) {
      it(`${format} 로 추출하면 ${audioCodec} 오디오가 끝까지 디코딩된다`, async () => {
        const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format, decodeCheck: true });

        assertExtractedAudioPlays(outcome, sourceOf(PINNED_SAMPLE), { container, mimeType, audioCodec });
      });
    }
  });

  describe("소스 오디오 코덱별 — m4a 로 추출한다", () => {
    for (const sample of MATRIX.withVideo("h264")) {
      it(`${sample.audioCodec} 소스에서 재생 가능한 aac 가 나온다`, async () => {
        const outcome = await extractSampleAudio({ sample, format: "m4a", decodeCheck: true });

        assertExtractedAudioPlays(outcome, sourceOf(sample), {
          container: "m4a",
          mimeType: "audio/mp4",
          audioCodec: "aac",
        });
      });
    }
  });

  describe("현재 동작 기록: wav 추출물은 재생할 수 없다", () => {
    it("wav 로 추출하면 PCM 이 아니라 AAC 가 담겨 디코딩이 깨진다", async () => {
      // `defaultAudioCodec` returns AAC for every format except mp3 and ogg, so
      // `.wav` gets AAC. The WAV muxer accepts it — WAV stores a codec tag rather
      // than a fixed format — and the file probes as healthy. Only a full decode
      // shows the truth. There is no correct option either: `AudioCodec` has no
      // PCM member, so this format cannot currently be asked for properly.
      const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format: "wav", decodeCheck: true });

      assert.equal(outcome.profile.container, "wav");
      assert.equal(outcome.profile.audioCodec, "aac", "AAC inside a WAV container is the defect");
      assert.equal(outcome.resultMimeType, "audio/wav");

      // The probe is happy; the decoder is not.
      assert.ok(outcome.decode, "the extraction case must run a full decode check");
      assert.notEqual(outcome.decode.exitCode, 0, "decoding must fail");
      assert.ok(
        outcome.decode.errorLines.length > 0,
        "the decoder must report errors, which is what a probe alone cannot show",
      );
      // And nothing measurable comes out of it.
      assert.equal(outcome.loudness.meanVolumeDb, null, "no loudness can be measured from an undecodable file");
    });
  });

  describe("오디오 코덱을 직접 지정", () => {
    it("m4a 에 aac 를 명시해도 기본값과 같은 결과가 나온다", async () => {
      const outcome = await extractSampleAudio({
        sample: PINNED_SAMPLE,
        format: "m4a",
        audioCodec: "aac",
        decodeCheck: true,
      });

      assertExtractedAudioPlays(outcome, sourceOf(PINNED_SAMPLE), {
        container: "m4a",
        mimeType: "audio/mp4",
        audioCodec: "aac",
      });
    });

    it("m4a 는 mp3 를 거부한다 — 확장자가 먹서를 가른다", async () => {
      // `.m4a` selects ffmpeg's `ipod` muxer, a restricted ISO BMFF profile with
      // a codec whitelist, while `.mp4` selects the general `mp4` muxer which
      // does carry MP3. Same base container, different muxer, different codec
      // policy — and `AudioFormat` offers no plain `.mp4` audio option, so MP3
      // extraction has to go to `.mp3`.
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
      // The codec samples carry a single audio track, so index 0 is the only
      // valid selection; this pins that `-map 0:a:0` is wired correctly.
      const outcome = await extractSampleAudio({
        sample: PINNED_SAMPLE,
        format: "m4a",
        audioTrackIndex: 0,
        decodeCheck: true,
      });

      assertExtractedAudioPlays(outcome, sourceOf(PINNED_SAMPLE), {
        container: "m4a",
        mimeType: "audio/mp4",
        audioCodec: "aac",
      });
    });
  });
});
