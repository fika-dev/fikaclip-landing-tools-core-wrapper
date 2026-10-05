/**
 * Translates the manifest's video codec name into the name ffprobe reports.
 *
 * `h265` and `hevc` are the same codec under two names: `hevc` is the ITU/MPEG
 * standard name ffmpeg uses internally, `h265` is the colloquial one. AV1, VP8,
 * VP9 and ProRes happen to match, so only HEVC needs translating.
 */
export function toProbeVideoCodecName(manifestCodec: string): string {
  return manifestCodec === "h265" ? "hevc" : manifestCodec;
}
