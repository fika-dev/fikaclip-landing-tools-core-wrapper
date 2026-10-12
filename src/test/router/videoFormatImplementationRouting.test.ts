import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ConvertVideoFormatEntity,
  FfmpegVideoFormatImplementation,
  MediabunnyVideoFormatImplementation,
  type MediaCommandRuntime,
  type Repository,
  type RoutableImplementation,
  RouterRepository,
} from "../../index";

describe("영상 포맷 구현 선택", () => {
  it("WebM 요청은 Mediabunny 구현만 실행한다", async () => {
    const result = await createRouter().execute(createEntity("webm"));

    assert.equal(result.result?.details.engine, "mediabunny");
  });

  it("MP4 요청은 FFmpeg 구현만 실행한다", async () => {
    const result = await createRouter().execute(createEntity("mp4"));

    assert.equal(result.result?.details.engine, "ffmpeg");
  });

  it("브라우저가 요청한 VP9 설정을 거부하면 WebM 구현을 선택하지 않는다", async () => {
    installSupportedWebCodecs({ video: false });

    await assert.rejects(() => createRouter(false).execute(createEntity("webm")), /No repository supports/);
  });

  it("VP8 지원 검사는 실제 변환과 같은 하드웨어 가속 설정을 사용한다", async () => {
    let checkedConfig: VideoEncoderConfig | undefined;
    installSupportedWebCodecs({
      onVideoConfig: (config) => {
        checkedConfig = config;
      },
    });
    const entity = createEntity("webm");
    entity.plan!.output.videoCodec = "vp8";
    entity.plan!.output.bitrate = 7_333_000;
    entity.inputMetadata = { size: { width: 1080, height: 1920 } };

    await createRouter(false).execute(entity);

    assert.equal(checkedConfig?.codec, "vp8");
    assert.equal(checkedConfig?.width, 1080);
    assert.equal(checkedConfig?.height, 1920);
    assert.equal(checkedConfig?.bitrate, 7_333_000);
    assert.equal(checkedConfig?.hardwareAcceleration, "no-preference");
  });
});

function createRouter(installCodecs = true) {
  if (installCodecs) installSupportedWebCodecs();
  const mediabunny = new MediabunnyVideoFormatImplementation();
  const ffmpeg = new FfmpegVideoFormatImplementation({ runtime: createRuntimeStub() });

  return new RouterRepository<ConvertVideoFormatEntity>(
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
    [withMarkerRepository(mediabunny), withMarkerRepository(ffmpeg)],
  );
}

function installSupportedWebCodecs(
  support: {
    video?: boolean;
    audio?: boolean;
    onVideoConfig?: (config: VideoEncoderConfig) => void;
  } = {},
) {
  Object.defineProperty(globalThis, "VideoEncoder", {
    configurable: true,
    value: class {
      static isConfigSupported(config: VideoEncoderConfig) {
        support.onVideoConfig?.(config);
        return Promise.resolve({ config, supported: support.video ?? true });
      }
    },
  });
  Object.defineProperty(globalThis, "AudioEncoder", {
    configurable: true,
    value: class {
      static isConfigSupported(config: AudioEncoderConfig) {
        return Promise.resolve({ config, supported: support.audio ?? true });
      }
    },
  });
}

function withMarkerRepository(
  implementation: RoutableImplementation<ConvertVideoFormatEntity>,
): RoutableImplementation<ConvertVideoFormatEntity> {
  const marker: Repository<ConvertVideoFormatEntity> = {
    id: `${implementation.name}-marker`,
    execute: async (entity) => ({
      ...entity,
      result: {
        blob: new Blob(),
        fileName: "output",
        mimeType: "video/test",
        sizeBytes: 0,
        details: { ...entity.plan!, engine: implementation.name },
      },
    }),
  };

  return {
    id: implementation.id,
    name: implementation.name,
    repositories: [marker],
    assess: implementation.assess.bind(implementation),
  };
}

function createEntity(format: "mp4" | "webm"): ConvertVideoFormatEntity {
  return {
    command: { source: { type: "blob", blob: new Blob() }, output: { format } },
    jobId: "implementation-routing-test",
    plan: {
      mode: "transcode",
      output: {
        format,
        videoCodec: format === "webm" ? "vp9" : "h264",
        audioCodec: format === "webm" ? "opus" : "aac",
      },
      warnings: [],
    },
  };
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
