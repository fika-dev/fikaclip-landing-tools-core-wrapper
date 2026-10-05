/**
 * Audio codecs the test suite can produce for the track it injects into a video.
 * These are codec names as the sample manifest spells them, not ffmpeg encoder
 * names — one codec can have several encoders, which is exactly why the mapping
 * below has to be explicit.
 */
export type BeepAudioCodec = "pcm" | "mp3" | "aac" | "opus" | "vorbis" | "flac";

export type BeepAudioEncoding = {
  /**
   * Container the beep itself is written into, chosen by file extension because
   * that is what decides the ffmpeg *muxer*.
   *
   * It does not have to survive: `FfmpegMediaEditRepository` renames every
   * injected track to `<name>.<index>.input` before handing it to ffmpeg, and
   * ffmpeg still reads it, because the *demuxer* is detected from the file's
   * content rather than its extension. Muxing is extension-driven, demuxing is
   * content-driven.
   */
  fileExtension: string;

  /** ffmpeg encoder name. */
  encoder: string;

  /** Extra flags the encoder needs on top of the shared beep arguments. */
  extraArgs: string[];
};

export const BEEP_AUDIO_ENCODINGS: Record<BeepAudioCodec, BeepAudioEncoding> = {
  // Uncompressed. Largest output, but every container and decoder accepts it.
  pcm: { fileExtension: "wav", encoder: "pcm_s16le", extraArgs: [] },
  mp3: { fileExtension: "mp3", encoder: "libmp3lame", extraArgs: [] },
  // AAC in a bare `.aac` stream is awkward to seek, so the beep goes in MP4.
  aac: { fileExtension: "m4a", encoder: "aac", extraArgs: [] },
  opus: { fileExtension: "ogg", encoder: "libopus", extraArgs: [] },
  // `libvorbis` is not always compiled in; ffmpeg's native `vorbis` encoder is
  // marked experimental, so it refuses to start unless strictness is lowered.
  // It also supports stereo only, which the shared `-ac 2` already guarantees.
  vorbis: { fileExtension: "ogg", encoder: "vorbis", extraArgs: ["-strict", "-2"] },
  flac: { fileExtension: "flac", encoder: "flac", extraArgs: [] },
};
