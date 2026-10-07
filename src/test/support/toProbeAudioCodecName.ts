/**
 * Translates the manifest's audio codec name into the name ffprobe reports.
 *
 * `pcm` is a family, not a codec: the bit depth, signedness and endianness are
 * part of the identity, so ffmpeg names the concrete variant. The 1-second
 * samples are 16-bit little-endian, hence `pcm_s16le`. AAC, MP3, Opus, Vorbis
 * and FLAC each have a single name and need no translation.
 */
export function toProbeAudioCodecName(manifestCodec: string): string {
  return manifestCodec === "pcm" ? "pcm_s16le" : manifestCodec;
}
