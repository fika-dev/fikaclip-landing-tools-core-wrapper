import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AudioSample } from "mediabunny";

import type { MediaCommandRuntime, MediaEditEntity, Repository, RoutableImplementation } from "../../index";
import {
  FfmpegAdjustAudioVolumeImplementation,
  FfmpegMuteAudioImplementation,
  MediabunnyAdjustAudioVolumeImplementation,
  MediabunnyMuteAudioImplementation,
  RouterRepository,
} from "../../index";
import { applyTimedGains } from "../../data/mediabunny/media-editing/MediabunnyAudioSampleTransform";

describe("Mediabunny WebM audio editing", () => {
  it("전체 음소거 WebM은 encoder 없이 Mediabunny를 선택할 수 있다", () => {
    const implementation = new MediabunnyMuteAudioImplementation();
    const entity: MediaEditEntity = {
      jobId: "mute-all",
      command: {
        operation: "mute",
        source: { type: "blob", blob: new Blob([], { type: "video/webm" }) },
        fileName: "input.webm",
        muteAll: true,
      },
    };

    const assessment = implementation.assess(entity, {});
    assert.deepEqual(assessment, {
      supported: true,
      score: 170,
      reasons: ["native-audio-track-removal"],
    });
  });

  it("선택 구간의 sample 값만 변경한다", () => {
    const source = new AudioSample({
      data: new Float32Array([1, 1, 1, 1]),
      format: "f32-planar",
      sampleRate: 4,
      numberOfChannels: 1,
      timestamp: 0,
    });
    const transformed = applyTimedGains(source, [{ startSeconds: 0.25, endSeconds: 0.75, gain: 0 }]);
    const output = new Float32Array(4);
    transformed.copyTo(output, { format: "f32-planar", planeIndex: 0 });

    assert.deepEqual([...output], [1, 0, 0, 1]);
    source.close();
    transformed.close();
  });

  it("WebM 음소거는 Mediabunny 구현을 선택한다", async () => {
    installAudioWebCodecs();
    const result = await createRouter("mute").execute(createMuteEntity("webm"));
    assert.equal(result.result?.warnings[0], "mediabunny");
  });

  it("WebM 음량 조절은 Mediabunny 구현을 선택한다", async () => {
    installAudioWebCodecs();
    const result = await createRouter("adjust-volume").execute(createVolumeEntity("webm"));
    assert.equal(result.result?.warnings[0], "mediabunny");
  });

  it("MP4 오디오 편집은 FFmpeg fallback을 선택한다", async () => {
    installAudioWebCodecs();
    const result = await createRouter("mute").execute(createMuteEntity("mp4"));
    assert.equal(result.result?.warnings[0], "ffmpeg");
  });
});

function createRouter(operation: "mute" | "adjust-volume") {
  const runtime = createRuntimeStub();
  const implementations =
    operation === "mute"
      ? [new MediabunnyMuteAudioImplementation(), new FfmpegMuteAudioImplementation({ runtime })]
      : [new MediabunnyAdjustAudioVolumeImplementation(), new FfmpegAdjustAudioVolumeImplementation({ runtime })];

  return new RouterRepository<MediaEditEntity>(
    [
      {
        collect: () => ({
          browser: {
            isMobile: false,
            isLikelyInAppBrowser: false,
            isStorageEstimateSupported: false,
            isDeviceMemorySupported: false,
            webCodecs: { isVideoEncoderSupported: true, isAudioEncoderSupported: true },
          },
        }),
      },
    ],
    implementations.map(withMarkerRepository),
  );
}

function withMarkerRepository(
  implementation: RoutableImplementation<MediaEditEntity>,
): RoutableImplementation<MediaEditEntity> {
  const marker: Repository<MediaEditEntity> = {
    id: `${implementation.name}-marker`,
    execute: async (entity) => ({
      ...entity,
      result: {
        operation: entity.command.operation,
        blob: new Blob(),
        fileName: "output",
        mimeType: "video/test",
        sizeBytes: 0,
        warnings: [implementation.name],
      },
    }),
  };

  return { ...implementation, repositories: [marker], assess: implementation.assess.bind(implementation) };
}

function createMuteEntity(format: "mp4" | "webm"): MediaEditEntity {
  return {
    command: {
      operation: "mute",
      source: { type: "blob", blob: new Blob([], { type: `video/${format}` }) },
      fileName: `input.${format}`,
      segments: [{ startSeconds: 0, endSeconds: 1 }],
    },
    jobId: "mute-routing-test",
  };
}

function createVolumeEntity(format: "mp4" | "webm"): MediaEditEntity {
  return {
    command: {
      operation: "adjust-volume",
      source: { type: "blob", blob: new Blob([], { type: `video/${format}` }) },
      fileName: `input.${format}`,
      segments: [{ startSeconds: 0, endSeconds: 1, volume: 0.5 }],
    },
    jobId: "volume-routing-test",
  };
}

function installAudioWebCodecs() {
  Object.defineProperty(globalThis, "AudioDecoder", { configurable: true, value: class {} });
  Object.defineProperty(globalThis, "AudioEncoder", { configurable: true, value: class {} });
}

function createRuntimeStub(): MediaCommandRuntime {
  return {
    writeFile: async () => undefined,
    readFile: async () => new Uint8Array(),
    deleteFile: async () => undefined,
    exec: async () => 0,
    onProgress: () => undefined,
    offProgress: () => undefined,
  };
}
