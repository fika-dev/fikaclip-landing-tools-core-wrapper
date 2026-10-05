import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertBeepWasInserted,
  assertSampleMatchesManifest,
  insertBeepIntoSample,
  loadCodecSampleVideos,
  pickSample,
  toProbeVideoCodecName,
  type BeepAudioCodec,
} from "../support";

const SAMPLES = loadCodecSampleVideos("mp4");
const PINNED_SAMPLE = pickSample(SAMPLES, { videoCodec: "h264", audioCodec: "aac" });

/**
 * Audio codecs MP4 (ISO base media file format) can legally carry.
 *
 * MP4 is a registration-based container: a codec needs a defined sample entry
 * and object type to be stored, so the legal set is narrow and explicit. AAC is
 * the native choice, MP3 has a legacy registration, and Opus gained one later.
 * Uncompressed PCM and FLAC have no standard MP4 mapping, which is why they are
 * absent here even though ffmpeg can be coerced into writing them.
 */
const CONTAINER_LEGAL_AUDIO_CODECS: BeepAudioCodec[] = ["aac", "mp3", "opus"];

/** Universally decodable, so sweeping source codecs is not also testing the beep. */
const PINNED_BEEP_CODEC: BeepAudioCodec = "pcm";

const EXPECTED_MIME_TYPE = "video/mp4";

describe("mp4 컨테이너에 오디오 추가", () => {
  describe("픽스처가 매니페스트와 일치하는지", () => {
    for (const sample of SAMPLES) {
      it(`${sample.fileName} 은 ${sample.videoCodec}/${sample.audioCodec} 이다`, async () => {
        await assertSampleMatchesManifest(sample);
      });
    }
  });

  describe("MP4 가 허용하는 오디오 코덱별로 비프음 삽입", () => {
    for (const beepCodec of CONTAINER_LEGAL_AUDIO_CODECS) {
      it(`${beepCodec} 비프음을 넣으면 mp4/aac 로 출력된다`, async () => {
        const outcome = await insertBeepIntoSample({ sample: PINNED_SAMPLE, beepCodec });

        assertBeepWasInserted(outcome, {
          container: "mp4",
          videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
          mimeType: EXPECTED_MIME_TYPE,
        });
      });
    }
  });

  describe("소스 비디오/오디오 코덱별로 비프음 삽입", () => {
    for (const sample of SAMPLES) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스의 비디오 스트림이 재인코딩 없이 보존된다`, async () => {
        const outcome = await insertBeepIntoSample({ sample, beepCodec: PINNED_BEEP_CODEC });

        assertBeepWasInserted(outcome, {
          container: "mp4",
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          mimeType: EXPECTED_MIME_TYPE,
        });
      });
    }
  });

  describe("현재 동작 기록: 원본 오디오는 믹스되지 않고 교체된다", () => {
    it("볼륨 0 비프음을 넣으면 출력이 무음이 된다", async () => {
      // Structural proof rather than spectral analysis: if the source audio were
      // mixed in, muting only the inserted track would leave it audible. The
      // add-audio filter graph builds `amix` from the injected tracks alone and
      // maps `0:v?` plus `[mixed]`, so the source audio never reaches the output.
      const outcome = await insertBeepIntoSample({
        sample: PINNED_SAMPLE,
        beepCodec: PINNED_BEEP_CODEC,
        trackVolume: 0,
      });

      assert.equal(outcome.profile.audioStreamCount, 1, "output still carries exactly one audio stream");
      assert.ok(
        outcome.loudness.isSilent,
        `source audio leaked into the mix (mean volume ${outcome.loudness.meanVolumeDb} dB)`,
      );
    });
  });
});
