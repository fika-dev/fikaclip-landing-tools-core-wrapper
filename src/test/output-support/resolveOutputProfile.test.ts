import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultOutputCodecsFor,
  resolveMediaOutputProfile,
  type MediaOutputIntent,
  type VideoContainerFormat,
} from "../../index";

const CONTAINERS: VideoContainerFormat[] = ["mp4", "mov", "webm", "mkv"];

const COPY_VIDEO_REENCODE_AUDIO: MediaOutputIntent = { video: "copy", audio: "reencode" };
const REENCODE_VIDEO_COPY_AUDIO: MediaOutputIntent = { video: "reencode", audio: "copy" };

/**
 * The decision every operation now defers to.
 *
 * Operations declare what they do to each stream; this turns that into codecs
 * using the output container's own rules. It is the piece that removed the
 * hardcoded `-c:a aac` from four operations at once, so it is worth pinning
 * without touching media.
 */
describe("출력 프로필 해결", () => {
  describe("코덱을 지정하지 않으면 컨테이너 기본값이 쓰인다", () => {
    for (const format of CONTAINERS) {
      it(`${format} 는 ${JSON.stringify(defaultOutputCodecsFor(format))} 를 쓴다`, () => {
        const profile = resolveMediaOutputProfile({
          format,
          intent: { video: "reencode", audio: "reencode" },
        });

        assert.deepEqual(profile, { format, ...defaultOutputCodecsFor(format) });
      });
    }
  });

  it("WebM 은 AAC 가 아니라 Opus 를 받는다 — 네 연산의 WebM 실패가 여기서 사라졌다", () => {
    const profile = resolveMediaOutputProfile({ format: "webm", intent: COPY_VIDEO_REENCODE_AUDIO });

    assert.equal(profile.audioCodec, "opus");
    assert.equal(profile.videoCodec, "copy", "볼륨·음소거·오디오 추가는 영상을 건드리지 않는다");
  });

  it("건드리지 않는 스트림은 copy 로 남는다", () => {
    const profile = resolveMediaOutputProfile({ format: "mp4", intent: REENCODE_VIDEO_COPY_AUDIO });

    assert.equal(profile.videoCodec, "h264");
    assert.equal(profile.audioCodec, "copy", "워터마크는 오디오를 복사한다");
  });

  it("제거하는 스트림은 none 이 된다", () => {
    const profile = resolveMediaOutputProfile({ format: "mp4", intent: { video: "copy", audio: "drop" } });

    assert.equal(profile.audioCodec, "none", "전체 음소거는 오디오 스트림을 없앤다");
  });

  describe("요청이 있으면 의도보다 요청을 따른다", () => {
    it("복사할 스트림에 코덱을 요청하면 그 코덱으로 재인코딩한다", () => {
      // This is how a caller steers a chain: ask for Opus at the volume step so
      // the later WebM mux becomes a remux instead of a second lossy encode.
      const profile = resolveMediaOutputProfile({
        format: "webm",
        intent: REENCODE_VIDEO_COPY_AUDIO,
        requested: { audioCodec: "opus" },
      });

      assert.equal(profile.audioCodec, "opus");
    });

    it("출력 컨테이너도 요청한 값이 그대로 쓰인다", () => {
      const profile = resolveMediaOutputProfile({
        format: "mkv",
        intent: COPY_VIDEO_REENCODE_AUDIO,
        requested: { audioCodec: "mp3" },
      });

      assert.deepEqual(profile, { format: "mkv", videoCodec: "copy", audioCodec: "mp3" });
    });
  });

  describe("모순된 요청은 조용히 넘기지 않고 거절한다", () => {
    it("재인코딩해야 하는 스트림을 copy 로 요청하면 거절한다", () => {
      assert.throws(
        () =>
          resolveMediaOutputProfile({
            format: "mp4",
            intent: COPY_VIDEO_REENCODE_AUDIO,
            requested: { audioCodec: "copy" },
          }),
        /re-encodes the audio stream, so it cannot be copied/,
      );
    });

    it("제거되는 스트림에 코덱을 요청하면 거절한다", () => {
      assert.throws(
        () =>
          resolveMediaOutputProfile({
            format: "mp4",
            intent: { video: "copy", audio: "drop" },
            requested: { audioCodec: "aac" },
          }),
        /removes the audio stream/,
      );
    });

    it("컨테이너가 담을 수 없는 코덱은 거절한다", () => {
      assert.throws(
        () =>
          resolveMediaOutputProfile({
            format: "webm",
            intent: COPY_VIDEO_REENCODE_AUDIO,
            requested: { audioCodec: "aac" },
          }),
        /webm output does not support aac audio/,
      );
    });

    it("AV1 출력 요청은 거절한다", () => {
      assert.throws(
        () =>
          resolveMediaOutputProfile({
            format: "mkv",
            intent: { video: "reencode", audio: "reencode" },
            requested: { videoCodec: "av1" },
          }),
        /does not support av1 video/,
      );
    });
  });
});
