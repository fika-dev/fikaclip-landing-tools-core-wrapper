import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertOutputAudioCodec,
  assertOutputVideoCodec,
  isSupportedOutputCombination,
  listSupportedOutputCombinations,
  OUTPUT_AUDIO_CODECS,
  OUTPUT_VIDEO_CODECS,
  SUPPORTED_OUTPUT_COMBINATIONS,
  type VideoContainerFormat,
} from "../../index";

/**
 * The published list of writable output combinations.
 *
 * No media is touched here: this is the declaration every operation test and
 * every caller reads to know what is offered, so it is worth pinning on its own.
 */
describe("지원 출력 조합 목록", () => {
  it("컨테이너별 조합 개수가 컨테이너 규칙과 일치한다", () => {
    // mp4/mov are registration-based and take H.264 or H.265 only; WebM takes
    // VP8/VP9 with Opus; Matroska is codec-agnostic and takes everything.
    const counts: Record<VideoContainerFormat, number> = {
      mp4: 2 * 3, // h264,h265 × aac,mp3,opus
      mov: 2 * 2, // h264,h265 × aac,mp3  (no standard Opus mapping)
      webm: 2 * 1, // vp8,vp9   × opus
      mkv: 4 * 3, // h264,h265,vp8,vp9 × aac,mp3,opus
    };

    for (const [format, expected] of Object.entries(counts)) {
      assert.equal(
        listSupportedOutputCombinations(format as VideoContainerFormat).length,
        expected,
        `${format} combination count`,
      );
    }
    assert.equal(SUPPORTED_OUTPUT_COMBINATIONS.length, 24, "total combination count");
  });

  it("모든 조합이 스스로의 유효성 검사를 통과한다", () => {
    for (const combination of SUPPORTED_OUTPUT_COMBINATIONS) {
      assert.ok(isSupportedOutputCombination(combination), `${JSON.stringify(combination)} must be supported`);
    }
  });

  it("AV1 은 출력 코덱 목록에 없다", () => {
    // AV1 input is still decoded — only writing it is withdrawn, because the AV1
    // encoders are far slower than the delivery codecs and are not dependably
    // compiled into an FFmpeg build.
    assert.deepEqual([...OUTPUT_VIDEO_CODECS], ["h264", "h265", "vp8", "vp9"]);
    assert.deepEqual([...OUTPUT_AUDIO_CODECS], ["aac", "opus", "mp3"]);
    assert.ok(
      SUPPORTED_OUTPUT_COMBINATIONS.every((combination) => combination.videoCodec !== ("av1" as never)),
      "no combination may offer AV1",
    );
  });

  describe("컨테이너 규칙을 어긴 조합은 거부된다", () => {
    const rejected = [
      { combination: { format: "webm", videoCodec: "h264", audioCodec: "opus" }, why: "WebM admits VP8/VP9 only" },
      { combination: { format: "webm", videoCodec: "vp9", audioCodec: "aac" }, why: "WebM admits Opus/Vorbis only" },
      { combination: { format: "mp4", videoCodec: "vp9", audioCodec: "aac" }, why: "MP4 has no VP9 sample entry" },
      { combination: { format: "mov", videoCodec: "h264", audioCodec: "opus" }, why: "MOV has no Opus mapping" },
      { combination: { format: "mkv", videoCodec: "av1", audioCodec: "aac" }, why: "AV1 output is withdrawn" },
    ] as const;

    for (const { combination, why } of rejected) {
      it(`${combination.format}/${combination.videoCodec}/${combination.audioCodec} — ${why}`, () => {
        assert.equal(isSupportedOutputCombination(combination), false);
      });
    }
  });
});

describe("출력 코덱 유효성 검사", () => {
  it("AV1 비디오 출력 요청은 지원 목록을 알려주며 예외를 던진다", () => {
    assert.throws(
      () => assertOutputVideoCodec("av1"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /av1 video output is not supported/);
        // The message has to name the alternatives, otherwise the caller learns
        // only that the request failed.
        assert.match(error.message, /h264, h265, vp8, vp9/);
        return true;
      },
    );
  });

  it("지원되는 코덱은 그대로 통과한다", () => {
    for (const codec of OUTPUT_VIDEO_CODECS) {
      assert.equal(assertOutputVideoCodec(codec), codec);
    }
    for (const codec of OUTPUT_AUDIO_CODECS) {
      assert.equal(assertOutputAudioCodec(codec), codec);
    }
  });

  it("copy 는 인코딩이 아니라 리먹싱이므로 통과한다", () => {
    // A stream copy is bounded by what the source already holds, not by encoder
    // support, so it is never checked against the output codec list.
    assert.equal(assertOutputVideoCodec("copy"), "copy");
    assert.equal(assertOutputAudioCodec("copy"), "copy");
  });
});
