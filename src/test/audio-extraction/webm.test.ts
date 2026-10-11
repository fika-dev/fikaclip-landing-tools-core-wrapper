import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  assertExtractedAudioPlays,
  extractSampleAudio,
  loadCodecSampleMatrix,
  measureSample,
  type CodecSampleVideo,
  type SampleMeasurement,
} from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");

/**
 * The audio formats that can be extracted, and the codec each one implies.
 *
 * The repository picks a codec that matches each output container.
 */
const PLAYABLE_FORMATS = [
  { format: "mp3", audioCodec: "mp3", mimeType: "audio/mpeg", container: "mp3" },
  { format: "m4a", audioCodec: "aac", mimeType: "audio/mp4", container: "m4a" },
  { format: "ogg", audioCodec: "opus", mimeType: "audio/ogg", container: "ogg" },
  { format: "wav", audioCodec: "pcm_s16le", mimeType: "audio/wav", container: "wav" },
] as const;

/**
 * Audio extraction is the one operation whose output container is independent of
 * the source's, so a webm source is not constrained by webm's
 * codec rules here — only by what the chosen audio format accepts.
 *
 * Extraction is the one operation whose output container is chosen by the caller
 * rather than inherited from the source, so WebM's Opus/Vorbis-only rule never
 * applies to its output at all — a WebM source extracts to AAC in an MP4-family
 * container without complaint.
 */
describe("webm 소스에서 오디오 추출", () => {
  const measurements = new Map<string, SampleMeasurement>();

  before(async () => {
    // Playability is judged against the source: same duration, same sample rate,
    // same channel count, same level. All of that needs the source measured.
    for (const sample of MATRIX.withVideo("vp9")) {
      measurements.set(sample.fileName, await measureSample(sample));
    }
  });

  const sourceOf = (sample: CodecSampleVideo) => {
    const measurement = measurements.get(sample.fileName);
    assert.ok(measurement, `missing a measurement for ${sample.fileName}`);
    return measurement;
  };

  describe("추출 포맷별 — 실제 재생 가능한 파일이 나온다", () => {
    for (const { format, audioCodec, mimeType, container } of PLAYABLE_FORMATS) {
      it(`${format} 로 추출하면 ${audioCodec} 오디오가 끝까지 디코딩된다`, async () => {
        const outcome = await extractSampleAudio({ sample: PINNED_SAMPLE, format, decodeCheck: true });

        assertExtractedAudioPlays(outcome, sourceOf(PINNED_SAMPLE), { container, mimeType, audioCodec });
      });
    }
  });

  describe("소스 오디오 코덱별 — m4a 로 추출한다", () => {
    for (const sample of MATRIX.withVideo("vp9")) {
      it(`${sample.audioCodec} 소스에서 재생 가능한 aac 가 나온다`, async () => {
        // Vorbis is decoded here even though it is not something the library can
        // write: decoding and encoding are separate capabilities.
        const outcome = await extractSampleAudio({ sample, format: "m4a", decodeCheck: true });

        assertExtractedAudioPlays(outcome, sourceOf(sample), {
          container: "m4a",
          mimeType: "audio/mp4",
          audioCodec: "aac",
        });
      });
    }
  });
});
