import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listSupportedOutputCombinations, type VideoContainerFormat } from "../../index";
import {
  assertMediaOutput,
  loadCodecSampleMatrix,
  runFormatConversionCase,
  toProbeAudioCodecName,
  toProbeVideoCodecName,
  type CodecSampleVideo,
} from "../support";

const COMBINATIONS = listSupportedOutputCombinations("mkv");
const PINNED_SAMPLE = loadCodecSampleMatrix("mkv").get("h264", "aac");

const EXPECTED_MIME_TYPE = "video/x-matroska";

const SOURCES_BY_CONTAINER: Record<VideoContainerFormat, CodecSampleVideo> = {
  mp4: loadCodecSampleMatrix("mp4").get("h264", "aac"),
  mov: loadCodecSampleMatrix("mov").get("h264", "aac"),
  webm: loadCodecSampleMatrix("webm").get("vp9", "opus"),
  mkv: PINNED_SAMPLE,
};

/**
 * Matroska is the only container that accepts every writable combination, and
 * remuxing into it is the only path by which codecs this library cannot encode
 * survive an operation at all.
 *
 * ProRes, PCM and FLAC have no encoder exposed here, so a transcode always loses
 * them. `-c copy` keeps them, because copying is bounded by what the source
 * holds rather than by encoder support.
 */
describe("mkv 로 포맷 변환", () => {
  describe("지원 출력 조합별 트랜스코딩", () => {
    for (const { videoCodec, audioCodec } of COMBINATIONS) {
      it(`${videoCodec}/${audioCodec} 로 변환된다`, async () => {
        const outcome = await runFormatConversionCase({
          sample: SOURCES_BY_CONTAINER.mp4,
          output: { format: "mkv", videoCodec, audioCodec },
        });

        assert.equal(outcome.plan.mode, "transcode");
        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: toProbeVideoCodecName(videoCodec),
          audioCodec,
          audible: true,
          width: 640,
          height: 360,
        });
      });
    }
  });

  describe("소스 컨테이너별 트랜스코딩", () => {
    for (const [container, sample] of Object.entries(SOURCES_BY_CONTAINER)) {
      it(`${container} 소스를 mkv/h264/aac 로 변환한다`, async () => {
        const outcome = await runFormatConversionCase({
          sample,
          output: { format: "mkv", videoCodec: "h264", audioCodec: "aac" },
        });

        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          videoCodec: "h264",
          audioCodec: "aac",
          audible: true,
        });
      });
    }
  });

  describe("리먹싱 — 인코딩할 수 없는 코덱도 보존된다", () => {
    const remuxCases = [
      { label: "mov/prores/pcm", sample: loadCodecSampleMatrix("mov").get("prores", "pcm") },
      { label: "mkv/h264/flac", sample: loadCodecSampleMatrix("mkv").get("h264", "flac") },
      { label: "webm/vp9/opus", sample: SOURCES_BY_CONTAINER.webm },
      { label: "mp4/h264/aac", sample: SOURCES_BY_CONTAINER.mp4 },
    ];

    for (const { label, sample } of remuxCases) {
      it(`${label} 가 코덱 그대로 mkv 로 옮겨진다`, async () => {
        const outcome = await runFormatConversionCase({ sample, output: { format: "mkv" }, mode: "remux" });

        assert.equal(outcome.plan.mode, "remux");
        assertMediaOutput(outcome, {
          container: "mkv",
          mimeType: EXPECTED_MIME_TYPE,
          // Both codecs are carried across unchanged, including the ones with no
          // encoder in this library.
          videoCodec: toProbeVideoCodecName(sample.videoCodec),
          audioCodec: toProbeAudioCodecName(sample.audioCodec),
          audible: true,
        });
      });
    }
  });
});
