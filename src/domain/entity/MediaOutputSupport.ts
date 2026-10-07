import type { AudioCodec, VideoCodec, VideoContainerFormat } from "./MediaTypes";

/**
 * Video codecs this library can *write*.
 *
 * `VideoCodec` is wider than this on purpose: it also names codecs that can be
 * read. AV1 is the clearest case — AV1 input is decoded normally, but AV1 output
 * is not offered, because the AV1 encoders are an order of magnitude slower than
 * the delivery codecs and are not dependably present in an FFmpeg build.
 * Requesting it raises an error instead of failing deep inside FFmpeg.
 */
export const OUTPUT_VIDEO_CODECS = ["h264", "h265", "vp8", "vp9"] as const;

export type OutputVideoCodec = (typeof OUTPUT_VIDEO_CODECS)[number];

/** Audio codecs this library can *write*. */
export const OUTPUT_AUDIO_CODECS = ["aac", "opus", "mp3"] as const;

export type OutputAudioCodec = (typeof OUTPUT_AUDIO_CODECS)[number];

/**
 * Video codecs each container may carry on output.
 *
 * WebM is a constrained Matroska profile that admits VP8 and VP9 only, and
 * Matroska itself is codec-agnostic and takes any.
 *
 * MP4 and MOV are narrowed by choice rather than by capability. FFmpeg can write
 * VP9 into MP4 — there is a standard sample entry for it — but Safari will not
 * play it, so an MP4 export meant to be universally playable must not offer it.
 * VP8 genuinely has no MP4 mapping and fails outright.
 */
const OUTPUT_VIDEO_CODECS_BY_FORMAT: Record<VideoContainerFormat, readonly OutputVideoCodec[]> = {
  mp4: ["h264", "h265"],
  mov: ["h264", "h265"],
  webm: ["vp8", "vp9"],
  mkv: ["h264", "h265", "vp8", "vp9"],
};

/**
 * Audio codecs each container may carry on output.
 *
 * WebM admits Opus and Vorbis; only Opus is writable here, so WebM output is
 * always Opus. MOV has no standard Opus mapping, which is why it is absent.
 */
const OUTPUT_AUDIO_CODECS_BY_FORMAT: Record<VideoContainerFormat, readonly OutputAudioCodec[]> = {
  mp4: ["aac", "mp3", "opus"],
  mov: ["aac", "mp3"],
  webm: ["opus"],
  mkv: ["aac", "mp3", "opus"],
};

export type MediaOutputCombination = {
  format: VideoContainerFormat;
  videoCodec: OutputVideoCodec;
  audioCodec: OutputAudioCodec;
};

/**
 * Every container/video/audio combination this library can write.
 *
 * Published so callers can offer exactly the choices that work — building a
 * format picker, validating a request, or driving a test matrix — instead of
 * rediscovering the rules from failed conversions.
 */
export const SUPPORTED_OUTPUT_COMBINATIONS: readonly MediaOutputCombination[] = Object.keys(
  OUTPUT_VIDEO_CODECS_BY_FORMAT,
).flatMap((key) => {
  const format = key as VideoContainerFormat;

  return OUTPUT_VIDEO_CODECS_BY_FORMAT[format].flatMap((videoCodec) =>
    OUTPUT_AUDIO_CODECS_BY_FORMAT[format].map((audioCodec) => ({ format, videoCodec, audioCodec })),
  );
});

export function listSupportedOutputCombinations(format?: VideoContainerFormat): readonly MediaOutputCombination[] {
  return format === undefined
    ? SUPPORTED_OUTPUT_COMBINATIONS
    : SUPPORTED_OUTPUT_COMBINATIONS.filter((combination) => combination.format === format);
}

export function isOutputVideoCodec(codec: VideoCodec | undefined): codec is OutputVideoCodec {
  return OUTPUT_VIDEO_CODECS.includes(codec as OutputVideoCodec);
}

export function isOutputAudioCodec(codec: AudioCodec | undefined): codec is OutputAudioCodec {
  return OUTPUT_AUDIO_CODECS.includes(codec as OutputAudioCodec);
}

export type MediaOutputCodecs = {
  videoCodec: OutputVideoCodec;
  audioCodec: OutputAudioCodec;
};

/**
 * What to write when the caller names a container but no codecs.
 *
 * Stated explicitly rather than taken from the first entry of the lists above:
 * those lists are capability sets with no preference order, and WebM in
 * particular should default to VP9 rather than the VP8 that happens to be listed
 * first.
 *
 * This table used to live inside `CodecCompatibilityRepository`, where only
 * format conversion could reach it — which is why every other operation
 * hardcoded AAC and failed on WebM. It is container knowledge, so it belongs
 * with the rest of the container rules.
 */
const DEFAULT_OUTPUT_CODECS_BY_FORMAT: Record<VideoContainerFormat, MediaOutputCodecs> = {
  mp4: { videoCodec: "h264", audioCodec: "aac" },
  mov: { videoCodec: "h264", audioCodec: "aac" },
  webm: { videoCodec: "vp9", audioCodec: "opus" },
  mkv: { videoCodec: "h264", audioCodec: "aac" },
};

export function defaultOutputCodecsFor(format: VideoContainerFormat): MediaOutputCodecs {
  return DEFAULT_OUTPUT_CODECS_BY_FORMAT[format];
}

export function listOutputVideoCodecs(format: VideoContainerFormat): readonly OutputVideoCodec[] {
  return OUTPUT_VIDEO_CODECS_BY_FORMAT[format];
}

export function listOutputAudioCodecs(format: VideoContainerFormat): readonly OutputAudioCodec[] {
  return OUTPUT_AUDIO_CODECS_BY_FORMAT[format];
}

export function isSupportedOutputCombination(combination: {
  format: VideoContainerFormat;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
}): boolean {
  if (!isOutputVideoCodec(combination.videoCodec)) return false;
  if (!isOutputAudioCodec(combination.audioCodec)) return false;

  return (
    OUTPUT_VIDEO_CODECS_BY_FORMAT[combination.format].includes(combination.videoCodec) &&
    OUTPUT_AUDIO_CODECS_BY_FORMAT[combination.format].includes(combination.audioCodec)
  );
}
