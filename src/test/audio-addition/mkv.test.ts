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

const SAMPLES = loadCodecSampleVideos("mkv");
const PINNED_SAMPLE = pickSample(SAMPLES, { videoCodec: "h264", audioCodec: "aac" });

/**
 * Audio codecs Matroska (MKV) can legally carry — effectively all of them.
 *
 * Matroska is codec-agnostic by design: a track stores a codec ID string plus
 * opaque private data, so supporting a new codec needs no container revision.
 * That is the opposite of MP4's registration model, and it is why the whole
 * beep matrix is swept here while MP4 and MOV get a narrower list.
 */
const CONTAINER_LEGAL_AUDIO_CODECS: BeepAudioCodec[] = ["aac", "mp3", "opus", "vorbis", "flac", "pcm"];

/** Universally decodable, so sweeping source codecs is not also testing the beep. */
const PINNED_BEEP_CODEC: BeepAudioCodec = "pcm";

const EXPECTED_MIME_TYPE = "video/x-matroska";

describe("mkv 컨테이너에 오디오 추가", () => {
  describe("픽스처가 매니페스트와 일치하는지", () => {
    for (const sample of SAMPLES) {
      it(`${sample.fileName} 은 ${sample.videoCodec}/${sample.audioCodec} 이다`, async () => {
        // ffprobe reports both MKV and WebM as `matroska,webm`, because WebM is
        // a constrained Matroska profile. Only the file extension separates them.
        await assertSampleMatchesManifest(sample);
      });
    }
  });

  describe("MKV 가 허용하는 오디오 코덱별로 비프음 삽입", () => {
    for (const beepCodec of CONTAINER_LEGAL_AUDIO_CODECS) {
      it(`${beepCodec} 비프음을 넣으면 mkv/aac 로 출력된다`, async () => {
        // Matroska would happily store the beep in its original codec, but the
        // repository re-encodes to AAC regardless, so the input codec only
        // exercises the decode side here.
        const outcome = await insertBeepIntoSample({ sample: PINNED_SAMPLE, beepCodec });

        assertBeepWasInserted(outcome, {
          container: "mkv",
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
          container: "mkv",
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          mimeType: EXPECTED_MIME_TYPE,
        });
      });
    }
  });

  describe("현재 동작 기록: 원본 오디오는 믹스되지 않고 교체된다", () => {
    it("볼륨 0 비프음을 넣으면 출력이 무음이 된다", async () => {
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
