import type { VideoContainerFormat } from "../../index";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { loadCodecSampleVideos } from "./loadCodecSampleVideos";

/**
 * A container's fixtures as the two axes they actually are: video codec and
 * audio codec.
 *
 * A container is not one thing — the same `.mp4` can hold several video/audio
 * codec pairings, and what the library does depends on the pairing rather than
 * on the extension. The fixtures are a complete product of the two axes for
 * every container, so exposing them as axes is lossless and lets a test say
 * which axis it is varying instead of iterating an undifferentiated list.
 */
export type CodecSampleMatrix = {
  container: VideoContainerFormat;
  /** Distinct video codecs, in manifest order and manifest spelling. */
  videoCodecs: readonly string[];
  /** Distinct audio codecs, in manifest order and manifest spelling. */
  audioCodecs: readonly string[];
  /** Every sample: the full video × audio product. */
  all: readonly CodecSampleVideo[];
  /** One sample. Throws rather than returning undefined, so a typo fails loudly. */
  get(videoCodec: string, audioCodec: string): CodecSampleVideo;
  /** Sweeps the video axis with the audio codec held fixed. */
  withAudio(audioCodec: string): readonly CodecSampleVideo[];
  /** Sweeps the audio axis with the video codec held fixed. */
  withVideo(videoCodec: string): readonly CodecSampleVideo[];
};

export function loadCodecSampleMatrix(container: VideoContainerFormat): CodecSampleMatrix {
  const all = loadCodecSampleVideos(container);
  const videoCodecs = distinct(all.map((sample) => sample.videoCodec));
  const audioCodecs = distinct(all.map((sample) => sample.audioCodec));
  const byPair = new Map(all.map((sample) => [pairKey(sample.videoCodec, sample.audioCodec), sample]));

  assertCompleteProduct(container, videoCodecs, audioCodecs, byPair);

  const get = (videoCodec: string, audioCodec: string) => {
    const sample = byPair.get(pairKey(videoCodec, audioCodec));

    if (!sample) {
      throw new Error(
        `No ${container} sample for ${videoCodec}/${audioCodec}. Available: ` +
          `video ${videoCodecs.join(", ")} × audio ${audioCodecs.join(", ")}.`,
      );
    }

    return sample;
  };

  return {
    container,
    videoCodecs,
    audioCodecs,
    all,
    get,
    withAudio: (audioCodec) => {
      assertAxisValue(container, "audio", audioCodec, audioCodecs);
      return videoCodecs.map((videoCodec) => get(videoCodec, audioCodec));
    },
    withVideo: (videoCodec) => {
      assertAxisValue(container, "video", videoCodec, videoCodecs);
      return audioCodecs.map((audioCodec) => get(videoCodec, audioCodec));
    },
  };
}

/**
 * The axis sweeps only mean what they claim if every pairing exists — a missing
 * pair would silently shrink a sweep and make it look like full coverage.
 */
function assertCompleteProduct(
  container: VideoContainerFormat,
  videoCodecs: readonly string[],
  audioCodecs: readonly string[],
  byPair: Map<string, CodecSampleVideo>,
) {
  const missing = videoCodecs.flatMap((videoCodec) =>
    audioCodecs
      .filter((audioCodec) => !byPair.has(pairKey(videoCodec, audioCodec)))
      .map((audioCodec) => `${videoCodec}/${audioCodec}`),
  );

  if (missing.length > 0) {
    throw new Error(
      `The ${container} fixtures are not a complete codec product. Missing: ${missing.join(", ")}.`,
    );
  }
}

function assertAxisValue(
  container: VideoContainerFormat,
  axis: "video" | "audio",
  value: string,
  available: readonly string[],
) {
  if (!available.includes(value)) {
    throw new Error(`${container} has no ${axis} codec ${value}. Available: ${available.join(", ")}.`);
  }
}

function pairKey(videoCodec: string, audioCodec: string) {
  return `${videoCodec}/${audioCodec}`;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}
