import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createBeepAudioFile,
  createTestWorkspace,
  detectAudioLoudness,
  insertBeepIntoSample,
  loadCodecSampleMatrix,
  probeMediaProfile,
  runFfmpegOrThrow,
  toProbeVideoCodecName,
  type BeepAudioCodec,
  type CodecSampleVideo,
} from "../support";

const MATRIX = loadCodecSampleMatrix("webm");
const PINNED_SAMPLE = MATRIX.get("vp9", "opus");

/**
 * Audio codecs WebM can legally carry — and that is the whole list.
 *
 * WebM is a deliberately constrained Matroska profile: VP8, VP9 or AV1 video,
 * Vorbis or Opus audio, WebVTT subtitles. The restriction is the point, since it
 * guarantees any WebM file plays in any conforming browser. ffmpeg enforces it
 * in the muxer, so an out-of-profile codec fails at header-write time rather
 * than producing a file that only some players reject.
 */
const CONTAINER_LEGAL_AUDIO_CODECS: BeepAudioCodec[] = ["opus", "vorbis"];

describe("webm 컨테이너에 오디오 추가", () => {
  /**
   * These cases document a real defect, not a container limitation.
   *
   * The `add-audio` branch of `FfmpegMediaEditRepository` hardcodes `-c:a aac`
   * and never inspects the output container, so every WebM input fails. When
   * the repository learns to pick a container-legal audio encoder, these tests
   * will start failing — that is the signal that the fix landed and the
   * expectations below should become success assertions.
   */
  describe("현재 동작 기록: WebM 먹서가 AAC 를 거부해 모든 삽입이 실패한다", () => {
    for (const beepCodec of CONTAINER_LEGAL_AUDIO_CODECS) {
      it(`${beepCodec} 비프음 삽입이 '-c:a aac' 하드코딩 때문에 실패한다`, async () => {
        await assert.rejects(
          () => insertBeepIntoSample({ sample: PINNED_SAMPLE, beepCodec }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            // The repository surfaces ffmpeg's exit code...
            assert.match(error.message, /ffmpeg add-audio failed with exit code \d+\./);
            // ...the argv shows the hardcoded encoder that caused it...
            assert.match(error.message, /-c:a aac/);
            // ...and the muxer states the profile rule it enforces.
            assert.match(error.message, /supported for WebM/);
            return true;
          },
        );
      });
    }

    for (const sample of MATRIX.all) {
      it(`${sample.videoCodec}/${sample.audioCodec} 소스도 동일하게 실패한다`, async () => {
        // Sweeping the source codecs shows the failure is container-driven: VP8,
        // VP9 and AV1 are all in-profile video, so none of them is the problem.
        await assert.rejects(
          () => insertBeepIntoSample({ sample, beepCodec: "opus" }),
          /supported for WebM/,
        );
      });
    }
  });

  /**
   * Control experiment. Same source, same beep, same filter graph the repository
   * builds — only the output audio encoder differs. Success here isolates the
   * cause to the hardcoded encoder rather than the container, the filter graph,
   * or the fixtures, and shows what the fix has to produce.
   */
  describe("대조군: 출력 오디오 인코더만 libopus 로 바꾸면 성공한다", () => {
    it("동일한 소스와 필터 그래프로 webm/opus 가 만들어진다", async () => {
      const outcome = await muxBeepWithAudioEncoder(PINNED_SAMPLE, "opus", "libopus");

      assert.equal(outcome.profile.container, "webm");
      assert.equal(outcome.profile.videoCodec, toProbeVideoCodecName(PINNED_SAMPLE.videoCodec));
      assert.equal(outcome.profile.audioCodec, "opus");
      assert.equal(outcome.profile.audioStreamCount, 1);
      assert.equal(outcome.profile.channels, 2);
      assert.ok(!outcome.loudness.isSilent, `beep is inaudible (${outcome.loudness.meanVolumeDb} dB)`);
    });
  });
});

/**
 * Reproduces the repository's add-audio invocation with a substituted audio
 * encoder. The filter graph is copied verbatim from `buildMixFilter` for a
 * single track with no volume or delay, so the only variable is `-c:a`.
 */
async function muxBeepWithAudioEncoder(sample: CodecSampleVideo, beepCodec: BeepAudioCodec, audioEncoder: string) {
  const workspace = await createTestWorkspace(`audio-addition-control-${sample.container}`);

  try {
    const beep = await createBeepAudioFile({ workDir: workspace.dir, codec: beepCodec });
    const outputFileName = `control-output${path.extname(sample.fileName)}`;

    await runFfmpegOrThrow(
      [
        "-i",
        sample.filePath,
        "-i",
        beep.fileName,
        "-filter_complex",
        "[1:a]aresample=async=1[a0];[a0]amix=inputs=1:duration=longest:dropout_transition=0[mixed]",
        "-map",
        "0:v?",
        "-map",
        "[mixed]",
        "-c:v",
        "copy",
        "-c:a",
        audioEncoder,
        "-shortest",
        "-y",
        outputFileName,
      ],
      { cwd: workspace.dir },
    );

    const outputPath = path.join(workspace.dir, outputFileName);
    const [profile, loudness] = await Promise.all([probeMediaProfile(outputPath), detectAudioLoudness(outputPath)]);

    return { profile, loudness };
  } finally {
    await workspace.cleanup();
  }
}
