import {
  isOutputAudioCodec,
  isOutputVideoCodec,
  listOutputAudioCodecs,
  listOutputVideoCodecs,
  OUTPUT_AUDIO_CODECS,
  OUTPUT_VIDEO_CODECS,
  type AudioCodec,
  type OutputAudioCodec,
  type OutputVideoCodec,
  type VideoCodec,
  type VideoContainerFormat,
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

/**
 * Rejects a requested output whose codecs the container does not offer.
 *
 * Without this, an unsupported request reaches FFmpeg and either fails with a
 * bare exit code several layers down or — worse — succeeds and produces a file
 * outside the declared support, such as VP9 in MP4, which Safari refuses.
 *
 * `copy` and `none` are skipped: neither picks an encoder, so neither is bounded
 * by what the container can be asked to write.
 */
export function assertSupportedOutputRequest(request: {
  format: VideoContainerFormat;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
}): void {
  const { format, videoCodec, audioCodec } = request;

  if (videoCodec !== undefined && videoCodec !== "copy") {
    const allowed = listOutputVideoCodecs(format);

    if (!isOutputVideoCodec(videoCodec) || !allowed.includes(videoCodec)) {
      throw new Error(`${format} output does not support ${videoCodec} video. Supported: ${allowed.join(", ")}.`);
    }
  }

  if (audioCodec !== undefined && audioCodec !== "copy" && audioCodec !== "none") {
    const allowed = listOutputAudioCodecs(format);

    if (!isOutputAudioCodec(audioCodec) || !allowed.includes(audioCodec)) {
      throw new Error(`${format} output does not support ${audioCodec} audio. Supported: ${allowed.join(", ")}.`);
    }
  }
}
