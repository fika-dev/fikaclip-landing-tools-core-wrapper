import {
  isOutputAudioCodec,
  isOutputVideoCodec,
  OUTPUT_AUDIO_CODECS,
  OUTPUT_VIDEO_CODECS,
  type AudioCodec,
  type OutputAudioCodec,
  type OutputVideoCodec,
  type VideoCodec,
} from "../entity";

/**
 * Narrows a requested codec to one this library can actually write, raising a
 * named error otherwise.
 *
 * `copy` passes through: a stream copy is a remux, not an encode, so it is
 * bounded by what the source already contains rather than by encoder support.
 *
 * Validating here means an unsupported request fails with a sentence naming the
 * alternatives, rather than as an FFmpeg exit code several layers down.
 */
export function assertOutputVideoCodec(codec: VideoCodec): OutputVideoCodec | "copy" {
  if (codec === "copy") return codec;
  if (isOutputVideoCodec(codec)) return codec;

  throw new Error(
    `${codec} video output is not supported. Supported video codecs: ${OUTPUT_VIDEO_CODECS.join(", ")}.`,
  );
}

export function assertOutputAudioCodec(codec: Exclude<AudioCodec, "none">): OutputAudioCodec | "copy" {
  if (codec === "copy") return codec;
  if (isOutputAudioCodec(codec)) return codec;

  throw new Error(
    `${codec} audio output is not supported. Supported audio codecs: ${OUTPUT_AUDIO_CODECS.join(", ")}.`,
  );
}
