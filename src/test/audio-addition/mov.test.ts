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

const SAMPLES = loadCodecSampleVideos("mov");
const PINNED_SAMPLE = pickSample(SAMPLES, { videoCodec: "h264", audioCodec: "aac" });

/**
 * Audio codecs QuickTime (MOV) can legally carry.
 *
 * MOV and MP4 share an ancestry — MP4 was derived from QuickTime — so the
 * structure is nearly identical, but MOV's codec set is wider because it grew
 * as an editing format rather than a delivery one. Uncompressed PCM is the
 * notable addition: it is why the fixtures pair ProRes with PCM, a combination
 * MP4 has no standard mapping for.
 */
const CONTAINER_LEGAL_AUDIO_CODECS: BeepAudioCodec[] = ["aac", "pcm", "mp3"];

/** Universally decodable, so sweeping source codecs is not also testing the beep. */
const PINNED_BEEP_CODEC: BeepAudioCodec = "pcm";

const EXPECTED_MIME_TYPE = "video/quicktime";

describe("mov 컨테이너에 오디오 추가", () => {
  describe("픽스처가 매니페스트와 일치하는지", () => {
    for (const sample of SAMPLES) {
      it(`${sample.fileName} 은 ${sample.videoCodec}/${sample.audioCodec} 이다`, async () => {
        await assertSampleMatchesManifest(sample);
      });
    }
  });

  describe("MOV 가 허용하는 오디오 코덱별로 비프음 삽입", () => {
    for (const beepCodec of CONTAINER_LEGAL_AUDIO_CODECS) {
      it(`${beepCodec} 비프음을 넣으면 mov/aac 로 출력된다`, async () => {
        const outcome = await insertBeepIntoSample({ sample: PINNED_SAMPLE, beepCodec });

        assertBeepWasInserted(outcome, {
          container: "mov",
          videoCodec: toProbeVideoCodecName(PINNED_SAMPLE.videoCodec),
          mimeType: EXPECTED_MIME_TYPE,
        });
      });
    }
  });

  describe("소스 비디오/오디오 코덱별로 비프음 삽입", () => {
    for (const sample of SAMPLES) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스의 비디오 스트림이 재인코딩 없이 보존된다`, async () => {
        // ProRes matters here: it is an intermediate codec with a far higher
        // bitrate than the delivery codecs, so `-c:v copy` keeping it intact is
        // the difference between a remux and an accidental quality loss.
        const outcome = await insertBeepIntoSample({ sample, beepCodec: PINNED_BEEP_CODEC });

        assertBeepWasInserted(outcome, {
          container: "mov",
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
