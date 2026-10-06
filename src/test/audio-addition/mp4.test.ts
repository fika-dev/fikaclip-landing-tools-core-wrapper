import { describe, it } from "node:test";

import {
  assertMediaOutput,
  insertBeepIntoSample,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
  type BeepAudioCodec,
} from "../support";

const MATRIX = loadCodecSampleMatrix("mp4");
const PINNED_SAMPLE = MATRIX.get("h264", "aac");

/**
 * Audio codecs MP4 (ISO base media file format) can legally carry.
 *
 * MP4 is a registration-based container: a codec needs a defined sample entry
 * and object type to be stored, so the legal set is narrow and explicit. AAC is
 * the native choice, MP3 has a legacy registration, and Opus gained one later.
 * Uncompressed PCM and FLAC have no standard MP4 mapping, which is why they are
 * absent even though ffmpeg can be coerced into writing them.
 */
const CONTAINER_LEGAL_AUDIO_CODECS: BeepAudioCodec[] = ["aac", "mp3", "opus"];

/** Universally decodable, so sweeping source codecs is not also testing the beep. */
const PINNED_BEEP_CODEC: BeepAudioCodec = "pcm";

const EXPECTED_MIME_TYPE = "video/mp4";

describe("mp4 컨테이너에 오디오 추가", () => {
  describe("MP4 가 허용하는 오디오 코덱별로 비프음 삽입", () => {
    for (const beepCodec of CONTAINER_LEGAL_AUDIO_CODECS) {
      it(`${beepCodec} 비프음을 넣으면 mp4/aac 로 출력된다`, async () => {
        const outcome = await insertBeepIntoSample({ sample: PINNED_SAMPLE, beepCodec });

        assertMediaOutput(outcome, {
          container: "mp4",
          mimeType: EXPECTED_MIME_TYPE,
          // `-c:v copy` must carry the source codec through untouched...
          videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
          // ...while the audio is always re-encoded to AAC, because the
          // add-audio branch hardcodes `-c:a aac` whatever the input codec was.
          audioCodec: "aac",
          audible: true,
          channels: 2,
          sampleRate: 48000,
          durationSeconds: 1,
        });
      });
    }
  });

  describe("소스 비디오/오디오 코덱별로 비프음 삽입", () => {
    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스의 비디오 스트림이 재인코딩 없이 보존된다`, async () => {
        const outcome = await insertBeepIntoSample({ sample, beepCodec: PINNED_BEEP_CODEC });

        assertMediaOutput(outcome, {
          container: "mp4",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: "aac",
          audible: true,
          durationSeconds: 1,
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

      assertMediaOutput(outcome, {
        container: "mp4",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "aac",
        audible: false,
      });
    });
  });
});
