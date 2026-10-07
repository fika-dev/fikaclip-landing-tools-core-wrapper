import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CodecCompatibilityRepository,
  normalizeAudioCodec,
  normalizeVideoCodec,
  type ConvertVideoFormatEntity,
  type ConvertVideoFormatOutput,
  type MediaMetadata,
  type VideoFormatConversionMode,
} from "../../index";

const repository = new CodecCompatibilityRepository();

function plan(
  output: ConvertVideoFormatOutput,
  options: { mode?: VideoFormatConversionMode; inputMetadata?: MediaMetadata } = {},
) {
  const entity: ConvertVideoFormatEntity = {
    command: {
      source: { type: "blob", blob: new Blob([]) },
      output,
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    },
    jobId: "codec-compatibility-test",
    ...(options.inputMetadata === undefined ? {} : { inputMetadata: options.inputMetadata }),
  };

  const result = repository.execute(entity).plan;
  assert.ok(result, "repository must produce a plan");
  return result;
}

/**
 * The conversion planner decides *how* a conversion runs before any media is
 * touched, so it can be pinned without FFmpeg.
 *
 * The per-container codec table it reads is now shared with every other
 * operation through `defaultOutputCodecsFor`, so what is pinned here is the
 * planner's own decisions: which mode to use, and when a re-encode can be
 * downgraded to a copy.
 */
describe("포맷 변환 계획 수립", () => {
  it("코덱을 지정하지 않으면 리먹싱으로 계획된다", () => {
    // Nothing was asked to change except the container, so re-encoding would
    // only lose quality and time.
    const result = plan({ format: "mkv" });

    assert.equal(result.mode, "remux");
    assert.equal(result.output.videoCodec, "copy");
    assert.equal(result.output.audioCodec, "copy");
  });

  it("코덱이나 비트레이트를 지정하면 트랜스코딩으로 계획된다", () => {
    assert.equal(plan({ format: "mp4", videoCodec: "h264" }).mode, "transcode");
    assert.equal(plan({ format: "mp4", audioCodec: "aac" }).mode, "transcode");
    assert.equal(plan({ format: "mp4", bitrate: 500_000 }).mode, "transcode");
  });

  describe("컨테이너별 기본 코덱", () => {
    const defaults = [
      { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
      { format: "mov", videoCodec: "h264", audioCodec: "aac" },
      { format: "mkv", videoCodec: "h264", audioCodec: "aac" },
      // WebM is the interesting one: it cannot take H.264 or AAC. This table was
      // once private to the planner, which is why every other operation
      // hardcoded AAC and failed on WebM; `defaultOutputCodecsFor` now publishes
      // it and `resolveMediaOutputProfile` applies it everywhere.
      { format: "webm", videoCodec: "vp9", audioCodec: "opus" },
    ] as const;

    for (const expected of defaults) {
      it(`${expected.format} 트랜스코딩 기본값은 ${expected.videoCodec}/${expected.audioCodec} 이다`, () => {
        const result = plan({ format: expected.format }, { mode: "transcode" });

        assert.equal(result.output.videoCodec, expected.videoCodec);
        assert.equal(result.output.audioCodec, expected.audioCodec);
      });
    }
  });

  describe("입력 코덱이 목표와 같으면 재인코딩을 생략한다", () => {
    it("비디오 코덱이 일치하면 copy 로 바뀌고 경고가 남는다", () => {
      const result = plan(
        { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
        { inputMetadata: { video: { codec: "h264" }, audio: { codec: "opus" } } },
      );

      assert.equal(result.output.videoCodec, "copy");
      assert.equal(result.output.audioCodec, "aac", "audio differs, so it is still encoded");
      assert.ok(
        result.warnings.some((warning) => /video stream will be copied/.test(warning)),
        `expected a copy warning, got: ${result.warnings.join(" | ")}`,
      );
    });

    it("두 코덱이 모두 일치하면 계획 전체가 리먹싱으로 내려간다", () => {
      const result = plan(
        { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
        { inputMetadata: { video: { codec: "h264" }, audio: { codec: "aac" } } },
      );

      assert.equal(result.mode, "remux");
      assert.equal(result.output.videoCodec, "copy");
      assert.equal(result.output.audioCodec, "copy");
    });

    it("입력 메타데이터가 없으면 최적화를 건너뛰고 경고한다", () => {
      // This is the path a non-browser environment takes: probing needs a DOM,
      // so the planner proceeds without knowing the source codecs.
      const result = plan({ format: "mp4", videoCodec: "h264" });

      assert.equal(result.output.videoCodec, "h264", "no metadata means no copy optimisation");
      assert.ok(result.warnings.some((warning) => /could not be inspected/.test(warning)));
    });
  });
});

/**
 * Codec name normalisation maps container-level spellings onto the library's
 * vocabulary. Its gaps decide which sources can benefit from the copy
 * optimisation above.
 */
describe("코덱 이름 정규화", () => {
  it("컨테이너별 비디오 코덱 표기를 하나로 모은다", () => {
    // The same codec is spelled differently depending on where it is recorded:
    // `avc1` in an MP4 sample entry, `h264` by ffprobe, `V_VP9` in Matroska.
    assert.equal(normalizeVideoCodec("avc1"), "h264");
    assert.equal(normalizeVideoCodec("hvc1"), "h265");
    assert.equal(normalizeVideoCodec("hevc"), "h265");
    assert.equal(normalizeVideoCodec("av01"), "av1");
    assert.equal(normalizeVideoCodec("vp09"), "vp9");
  });

  it("AV1 은 입력으로는 계속 인식된다", () => {
    // Withdrawing AV1 *output* must not stop AV1 files from being read.
    assert.equal(normalizeVideoCodec("av1"), "av1");
  });

  describe("현재 한계: 정규화되지 않는 코덱", () => {
    // These return undefined, so `CodecCompatibilityRepository` can never match
    // them against a target and the copy optimisation silently does not fire.
    // The domain vocabulary cannot express them either: `VideoCodec` has no
    // ProRes and `AudioCodec` has no Vorbis, FLAC or PCM.
    const unrecognized = [
      { kind: "video", codec: "prores", normalize: normalizeVideoCodec },
      { kind: "audio", codec: "vorbis", normalize: normalizeAudioCodec },
      { kind: "audio", codec: "flac", normalize: normalizeAudioCodec },
      { kind: "audio", codec: "pcm_s16le", normalize: normalizeAudioCodec },
    ] as const;

    for (const { kind, codec, normalize } of unrecognized) {
      it(`${kind} ${codec} 는 undefined 로 떨어진다`, () => {
        assert.equal(normalize(codec), undefined);
      });
    }
  });
});
