import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FfmpegMediaEditRepository, type MediaCommandRuntime, type MediaEditCommand } from "../../index";

describe("오디오가 없는 영상 편집", () => {
  it("오디오 추출 요청을 실행 전에 명확히 거부한다", async () => {
    const runtime = new NoAudioRuntime();
    const repository = new FfmpegMediaEditRepository({ runtime });

    await assert.rejects(
      () =>
        repository.execute({
          command: { operation: "extract-audio", source: source(), fileName: "silent.mp4", format: "mp3" },
          jobId: "no-audio-extraction",
        }),
      /Audio track 0 does not exist/,
    );
    assert.equal(runtime.calls.length, 1);
  });

  it("잘못된 오디오 트랙 번호를 실행 전에 거부한다", async () => {
    const runtime = new NoAudioRuntime();
    const repository = new FfmpegMediaEditRepository({ runtime });

    await assert.rejects(
      () =>
        repository.execute({
          command: {
            operation: "extract-audio",
            source: source(),
            fileName: "silent.mp4",
            format: "mp3",
            audioTrackIndex: -1,
          },
          jobId: "invalid-audio-index",
        }),
      /Audio track index must be a non-negative integer/,
    );
    assert.equal(runtime.calls.length, 0);
  });

  it("볼륨 조절 요청이 영상 복사로 안전하게 끝난다", async () => {
    const args = await executeWithoutAudio({
      operation: "adjust-volume",
      source: source(),
      fileName: "silent.mp4",
      segments: [{ startSeconds: 0, endSeconds: 1, volume: 0.5 }],
    });

    assert.deepEqual(args, ["-i", "silent.mp4", "-c:v", "copy", "-an", "silent.adjust-volume.mp4"]);
  });

  it("구간 음소거 요청이 영상 복사로 안전하게 끝난다", async () => {
    const args = await executeWithoutAudio({
      operation: "mute",
      source: source(),
      fileName: "silent.mp4",
      segments: [{ startSeconds: 0, endSeconds: 1 }],
    });

    assert.deepEqual(args, ["-i", "silent.mp4", "-c:v", "copy", "-an", "silent.mute.mp4"]);
  });

  it("원본 오디오 포함 요청이 있어도 없는 스트림을 필터에 넣지 않는다", async () => {
    const runtime = new NoAudioSourceWithTrackRuntime();
    const repository = new FfmpegMediaEditRepository({ runtime });

    await repository.execute({
      command: {
        operation: "add-audio",
        source: source(),
        fileName: "silent.mp4",
        includeOriginalAudio: true,
        tracks: [{ source: source(), fileName: "track.wav" }],
      },
      jobId: "no-original-audio",
    });

    assert.equal(runtime.calls.length, 3);
    assert.ok(
      runtime.calls[2].some((argument) =>
        argument.includes("[a0]amix=inputs=1:duration=longest:dropout_transition=0,apad[mixed]"),
      ),
    );
  });

  it("추가 파일에 오디오 스트림이 없으면 실행 전에 거부한다", async () => {
    const runtime = new MissingAddedAudioRuntime();
    const repository = new FfmpegMediaEditRepository({ runtime });

    await assert.rejects(
      () =>
        repository.execute({
          command: {
            operation: "add-audio",
            source: source(),
            fileName: "input.mp4",
            tracks: [{ source: source(), fileName: "not-audio.mp4" }],
          },
          jobId: "missing-added-audio",
        }),
      /Added audio track 0 does not contain an audio stream/,
    );
    assert.equal(runtime.calls.length, 2);
  });
});

describe("미디어 편집 출력 호환성", () => {
  it("fileName 생략 시 File 자체 이름에서 컨테이너를 찾는다", async () => {
    const runtime = new AudioRuntime();
    const repository = new FfmpegMediaEditRepository({ runtime });

    await repository.execute({
      command: {
        operation: "adjust-volume",
        source: { type: "file", file: new File([new Uint8Array([0])], "input.webm", { type: "video/webm" }) },
        segments: [],
      },
      jobId: "file-name-fallback",
    });

    assert.deepEqual(runtime.calls[1], [
      "-i",
      "input.webm",
      "-af",
      "volume=1",
      "-c:v",
      "copy",
      "-c:a",
      "libopus",
      "input.adjust-volume.webm",
    ]);
  });

  it("컨테이너가 바뀌면 복사 예정 스트림도 목표 코덱으로 인코딩한다", async () => {
    const runtime = new AudioRuntime();
    const repository = new FfmpegMediaEditRepository({ runtime });

    await repository.execute({
      command: {
        operation: "adjust-volume",
        source: source(),
        fileName: "input.webm",
        segments: [],
        output: { format: "mp4" },
      },
      jobId: "cross-container",
    });

    assert.deepEqual(runtime.calls[1], [
      "-i",
      "input.webm",
      "-af",
      "volume=1",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "input.adjust-volume.mp4",
    ]);
  });
});

async function executeWithoutAudio(command: MediaEditCommand) {
  const runtime = new NoAudioRuntime();
  const repository = new FfmpegMediaEditRepository({ runtime });

  await repository.execute({ command, jobId: "no-audio" });

  assert.equal(runtime.calls.length, 2);
  assert.deepEqual(runtime.calls[0], [
    "-v",
    "error",
    "-i",
    "silent.mp4",
    "-map",
    "0:a:0",
    "-t",
    "0.01",
    "-f",
    "null",
    "-",
  ]);
  return runtime.calls[1];
}

function source() {
  return { type: "blob" as const, blob: new Blob([new Uint8Array([0])], { type: "video/mp4" }) };
}

class NoAudioRuntime implements MediaCommandRuntime {
  readonly calls: string[][] = [];

  onProgress() {}

  offProgress() {}

  async writeFile() {}

  async readFile() {
    return new Uint8Array([1]);
  }

  async deleteFile() {}

  async exec(args: string[]): Promise<number> {
    this.calls.push(args);
    return this.calls.length === 1 ? 1 : 0;
  }

  terminate() {}
}

class AudioRuntime extends NoAudioRuntime {
  override async exec(args: string[]) {
    this.calls.push(args);
    return 0;
  }
}

class NoAudioSourceWithTrackRuntime extends NoAudioRuntime {
  override async exec(args: string[]) {
    this.calls.push(args);
    return this.calls.length === 1 ? 1 : 0;
  }
}

class MissingAddedAudioRuntime extends NoAudioRuntime {
  override async exec(args: string[]) {
    this.calls.push(args);
    return this.calls.length === 1 ? 0 : 1;
  }
}
