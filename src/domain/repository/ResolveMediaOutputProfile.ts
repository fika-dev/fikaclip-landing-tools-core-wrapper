import {
  defaultOutputCodecsFor,
  type AudioCodec,
  type OutputAudioCodec,
  type OutputVideoCodec,
  type VideoCodec,
  type VideoContainerFormat,
} from "../entity";
import { assertOutputAudioCodec, assertOutputVideoCodec, assertSupportedOutputRequest } from "./MediaOutputValidation";

/**
 * What an operation does to a stream, independent of which codec that implies.
 *
 * - `copy` — the operation does not alter this stream, so it can be remuxed.
 * - `reencode` — the operation changes the samples, so a codec must be chosen.
 * - `drop` — the operation removes this stream.
 *
 * Cropping must re-encode video because the frame changes; volume adjustment
 * must re-encode audio but can copy video; watermarking is the reverse. That is
 * a property of the operation. *Which* codec a re-encode uses is a property of
 * the output container. Keeping the two apart is what lets one container table
 * serve every operation.
 */
export type MediaStreamIntent = "copy" | "reencode" | "drop";

export type MediaOutputIntent = {
  video: MediaStreamIntent;
  audio: MediaStreamIntent;
};

export type RequestedMediaOutput = {
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
};

export type ResolvedMediaOutput = {
  format: VideoContainerFormat;
  videoCodec: OutputVideoCodec | "copy" | "none";
  audioCodec: OutputAudioCodec | "copy" | "none";
};

/**
 * Decides what to write, from the operation's intent plus the output container.
 *
 * Before this existed each operation picked its own codecs and none of them
 * consulted the container, so `-c:a aac` was hardcoded in four places and every
 * one of them failed on WebM. Now an operation declares only what it does to
 * each stream and the container supplies the rest, which also lets a caller pass
 * the final target down a chain of operations — ask for Opus at the volume step
 * and the later WebM mux becomes a remux instead of a second lossy encode.
 *
 * Contradictions raise rather than resolve silently: asking to copy a stream the
 * operation has to re-encode, or naming a codec for a stream it removes, is a
 * mistake in the caller and is worth surfacing.
 */
export function resolveMediaOutputProfile(options: {
  format: VideoContainerFormat;
  intent: MediaOutputIntent;
  requested?: RequestedMediaOutput;
}): ResolvedMediaOutput {
  const { format, intent, requested } = options;

  // Validate the pair together first, so an unsupported combination is reported
  // as one request error rather than as whichever stream happened to resolve first.
  assertSupportedOutputRequest({ format, videoCodec: requested?.videoCodec, audioCodec: requested?.audioCodec });

  const fallback = defaultOutputCodecsFor(format);

  return {
    format,
    videoCodec: resolveStream({
      kind: "video",
      intent: intent.video,
      requested: requested?.videoCodec,
      fallback: fallback.videoCodec,
      narrow: assertOutputVideoCodec,
    }),
    audioCodec: resolveStream({
      kind: "audio",
      intent: intent.audio,
      requested: requested?.audioCodec,
      fallback: fallback.audioCodec,
      narrow: assertOutputAudioCodec,
    }),
  };
}

function resolveStream<Codec extends OutputVideoCodec | OutputAudioCodec>(options: {
  kind: "video" | "audio";
  intent: MediaStreamIntent;
  requested: VideoCodec | AudioCodec | undefined;
  fallback: Codec;
  narrow: (codec: never) => Codec | "copy";
}): Codec | "copy" | "none" {
  const { kind, intent, requested, fallback, narrow } = options;

  if (intent === "drop") {
    if (requested !== undefined && requested !== "none") {
      throw new Error(`This operation removes the ${kind} stream, so ${requested} ${kind} cannot be requested.`);
    }
    return "none";
  }

  if (requested === "none") return "none";

  if (requested === "copy") {
    if (intent === "reencode") {
      throw new Error(`This operation re-encodes the ${kind} stream, so it cannot be copied.`);
    }
    return "copy";
  }

  // A concrete request wins over the intent: an operation that would have copied
  // the stream can be asked to re-encode it into the container's codec instead,
  // which is how a caller steers a multi-step chain toward its final format.
  if (requested !== undefined) return narrow(requested as never) as Codec | "copy";

  return intent === "copy" ? "copy" : fallback;
}
