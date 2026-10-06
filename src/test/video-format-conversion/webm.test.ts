import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  listOutputAudioCodecs,
  listOutputVideoCodecs,
  listSupportedOutputCombinations,
  OUTPUT_AUDIO_CODECS,
  OUTPUT_VIDEO_CODECS,
  type VideoContainerFormat,
} from "../../index";
import {
  assertConversionOutput,
  loadCodecSampleMatrix,
  measureSample,
  runFormatConversionCase,
  toProbeAudioCodecName,
  toProbeVideoCodecName,
  type CodecSampleVideo,
  type SampleMeasurement,
} from "../support";

const TARGET: VideoContainerFormat = "webm";
const EXPECTED_MIME_TYPE = "video/webm";

const COMBINATIONS = listSupportedOutputCombinations(TARGET);

/** One representative source per container, so inputs are swept without the full matrix. */
const SOURCES: Record<VideoContainerFormat, CodecSampleVideo> = {
  mp4: loadCodecSampleMatrix("mp4").get("h264", "aac"),
  mov: loadCodecSampleMatrix("mov").get("h264", "aac"),
  webm: loadCodecSampleMatrix("webm").get("vp9", "opus"),
  mkv: loadCodecSampleMatrix("mkv").get("h264", "aac"),
};

/** A source in a different container, so every case is a real conversion. */
const PRIMARY_SOURCE = SOURCES.mp4;

/** Codecs this library can write but this container will not take. */
const REJECTED_VIDEO_CODECS = OUTPUT_VIDEO_CODECS.filter((codec) => !listOutputVideoCodecs(TARGET).includes(codec));
const REJECTED_AUDIO_CODECS = OUTPUT_AUDIO_CODECS.filter((codec) => !listOutputAudioCodecs(TARGET).includes(codec));

/**
 * Format conversion is the only operation that consults the container before
 * choosing codecs, so it is the only one with no WebM defect.
 *
 * It has two modes. `remux` rewrites the container with `-c copy`, keeping the
 * original codecs — fast and lossless, but it fails if the target will not hold
 * them. `transcode` re-encodes to the requested codecs.
 *
 * WebM is where the contrast with the editing operations is sharpest: this
 * operation asks what WebM accepts and gets VP9/Opus, while add-audio, volume,
 * mute, crop and watermark all assume AAC and fail.
 */
describe("webm 로 포맷 변환", () => {
  const measurements = new Map<VideoContainerFormat, SampleMeasurement>();

  before(async () => {
    // Each conversion is compared against its own input, so every source used
    // in this file is measured the same way the outputs are.
    for (const [container, sample] of Object.entries(SOURCES)) {
      measurements.set(container as VideoContainerFormat, await measureSample(sample));
    }
  });

  const sourceOf = (sample: CodecSampleVideo) => {
    const measurement = measurements.get(sample.container);
    assert.ok(measurement, `missing a measurement for ${sample.container}`);
    return measurement;
  };

  describe("지원 조합으로 변환하면 메타데이터가 목표대로 바뀐다", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 변환된다`, async () => {
        const outcome = await runFormatConversionCase({
          sample: PRIMARY_SOURCE,
          output: { format: TARGET, videoCodec, audioCodec },
        });

        assertConversionOutput({
          outcome,
          source: sourceOf(PRIMARY_SOURCE),
          expected: {
            container: TARGET,
            mimeType: EXPECTED_MIME_TYPE,
            videoCodec: toProbeVideoCodecName(videoCodec),
            audioCodec,
            // Naming codecs selects transcode; nothing else can honour the request.
            mode: "transcode",
          },
        });
      });
    }
  });

  describe("소스 컨테이너별로 변환해도 결과가 같다", () => {
    for (const [container, sample] of Object.entries(SOURCES)) {
      it(`${container} 소스를 webm/vp9/opus 로 변환한다`, async () => {
        const outcome = await runFormatConversionCase({
          sample,
          output: { format: TARGET, videoCodec: "vp9", audioCodec: "opus" },
        });

        assertConversionOutput({
          outcome,
          source: sourceOf(sample),
          expected: {
            container: TARGET,
            mimeType: EXPECTED_MIME_TYPE,
            videoCodec: toProbeVideoCodecName("vp9"),
            audioCodec: "opus",
            mode: "transcode",
          },
        });
      });
    }
  });

  describe("코덱을 지정하지 않으면 컨테이너 기본값이 쓰인다", () => {
    it(`트랜스코딩 기본값은 vp9/opus 다`, async () => {
      // This is the per-container knowledge the editing operations never consult.
      const outcome = await runFormatConversionCase({
        sample: PRIMARY_SOURCE,
        output: { format: TARGET },
        mode: "transcode",
      });

      assert.equal(outcome.plan.output.videoCodec, "vp9");
      assert.equal(outcome.plan.output.audioCodec, "opus");
      assertConversionOutput({
        outcome,
        source: sourceOf(PRIMARY_SOURCE),
        expected: {
          container: TARGET,
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName("vp9"),
          audioCodec: "opus",
          mode: "transcode",
        },
      });
    });
  });

  describe("리먹싱은 코덱을 그대로 옮긴다", () => {
    for (const sample of [loadCodecSampleMatrix("mkv").get("vp9", "opus")]) {
      it(`${sample.container}/${sample.videoCodec}/${sample.audioCodec} 를 재인코딩 없이 옮긴다`, async () => {
        const outcome = await runFormatConversionCase({ sample, output: { format: TARGET }, mode: "remux" });

        assert.equal(outcome.plan.output.videoCodec, "copy");
        assert.equal(outcome.plan.output.audioCodec, "copy");
        assertConversionOutput({
          outcome,
          source: sourceOf(sample),
          expected: {
            container: TARGET,
            mimeType: EXPECTED_MIME_TYPE,
            // `-c copy` means the source's codecs come across untouched, which is
            // the only way codecs this library cannot encode survive at all.
            videoCodec: toProbeVideoCodecName(sample.videoCodec),
            audioCodec: toProbeAudioCodecName(sample.audioCodec),
            mode: "remux",
          },
        });
      });
    }
  });

  /**
   * An unsupported pairing is a request error, so it is refused before FFmpeg
   * runs. Some of these FFmpeg could actually produce — VP9 in MP4 has a defined
   * sample entry and encodes fine — and they are still refused, because the
   * declared support list is about what plays everywhere, not about what the
   * muxer tolerates.
   */
  describe("지원하지 않는 조합은 거절한다", () => {
    for (const videoCodec of REJECTED_VIDEO_CODECS) {
      it(`${videoCodec} 영상 요청을 거절한다`, async () => {
        await assert.rejects(
          () => runFormatConversionCase({ sample: PRIMARY_SOURCE, output: { format: TARGET, videoCodec } }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, new RegExp(`${TARGET} output does not support ${videoCodec} video`));
            // The message has to name the alternatives, not just refuse.
            assert.match(error.message, new RegExp(listOutputVideoCodecs(TARGET).join(", ")));
            return true;
          },
        );
      });
    }

    for (const audioCodec of REJECTED_AUDIO_CODECS) {
      it(`${audioCodec} 소리 요청을 거절한다`, async () => {
        await assert.rejects(
          () => runFormatConversionCase({ sample: PRIMARY_SOURCE, output: { format: TARGET, audioCodec } }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, new RegExp(`${TARGET} output does not support ${audioCodec} audio`));
            assert.match(error.message, new RegExp(listOutputAudioCodecs(TARGET).join(", ")));
            return true;
          },
        );
      });
    }

    it("AV1 영상 요청을 거절한다", async () => {
      // AV1 is not writable in any container here: the encoders are far slower
      // than the delivery codecs and are not dependably compiled into FFmpeg.
      await assert.rejects(
        () =>
          runFormatConversionCase({
            sample: PRIMARY_SOURCE,
            // The command type still admits `av1` — only the planner refuses it,
            // so this is a runtime check rather than a compile-time one.
            output: { format: TARGET, videoCodec: "av1" },
          }),
        /output does not support av1 video/,
      );
    });
  });

  describe("현재 동작 기록: 프로필을 벗어난 리먹싱은 ffmpeg 단계에서 실패한다", () => {
    it("h264/aac 소스를 webm 으로 리먹싱하면 실패한다", async () => {
      // Expected, and the planner warns about it in advance: `-c copy` cannot
      // change codecs, so an out-of-profile source has nowhere to go. Requesting
      // a codec instead selects transcode, which succeeds.
      await assert.rejects(
        () => runFormatConversionCase({ sample: SOURCES.mp4, output: { format: TARGET }, mode: "remux" }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /ffmpeg conversion failed with exit code \d+\./);
          assert.match(error.message, /supported for WebM/);
          return true;
        },
      );
    });
  });
});
