import { describe, it } from "node:test";

import {
  assertMediaOutput,
  insertBeepIntoSample,
  loadCodecSampleMatrix,
  toProbeVideoCodecName,
  type BeepAudioCodec,
} from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");

/**
 * Audio codecs WebM can legally carry — and that is the whole list.
 *
 * WebM is a deliberately constrained Matroska profile: VP8, VP9 or AV1 video,
 * Vorbis or Opus audio, WebVTT subtitles. The restriction is the point, since it
 * guarantees any WebM file plays in any conforming browser.
 */
const CONTAINER_LEGAL_AUDIO_CODECS: BeepAudioCodec[] = ["opus", "vorbis"];

/** Universally decodable, so sweeping source codecs is not also testing the beep. */
const PINNED_BEEP_CODEC: BeepAudioCodec = "pcm";

const EXPECTED_MIME_TYPE = "video/webm";

/**
 * WebM used to fail here outright: the operation chose `-c:a aac` without
 * consulting the container, and the WebM muxer rejects AAC, so every insertion
 * died at header-write time.
 *
 * Now the operation declares only that it re-encodes audio and the container
 * supplies the codec — Opus for WebM. The expected output codec therefore differs
 * from the other containers' AAC, which is the point: one operation, adapting to
 * where it writes.
 */
describe("webm 컨테이너에 오디오 추가", () => {
  describe("WebM 가 허용하는 오디오 코덱별로 비프음 삽입", () => {
    for (const beepCodec of CONTAINER_LEGAL_AUDIO_CODECS) {
      it(`${beepCodec} 비프음을 넣으면 webm/opus 로 출력된다`, async () => {
        const outcome = await insertBeepIntoSample({ sample: PINNED_SAMPLE, beepCodec });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          // `-c:v copy` carries the source codec through untouched...
          videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
          // ...and the audio is encoded to the container's own default.
          audioCodec: "opus",
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
        // AV1 video is copied through even though AV1 output is withdrawn:
        // copying is bounded by what the source holds, not by encoder support.
        const outcome = await insertBeepIntoSample({ sample, beepCodec: PINNED_BEEP_CODEC });

        assertMediaOutput(outcome, {
          container: "webm",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: "opus",
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
        container: "webm",
        mimeType: EXPECTED_MIME_TYPE,
        videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
        audioCodec: "opus",
        audible: false,
      });
    });
  });
});
