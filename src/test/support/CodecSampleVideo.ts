import type { VideoContainerFormat } from "../../domain";

/**
 * One committed 1-second sample, described by the manifest that ships with it.
 *
 * `videoCodec` / `audioCodec` use the manifest's vocabulary (`h265`, `pcm`),
 * which is not always what ffprobe reports back (`hevc`, `pcm_s16le`) — see
 * `toProbeVideoCodecName` / `toProbeAudioCodecName`.
 */
export type CodecSampleVideo = {
  fileName: string;
  filePath: string;
  container: VideoContainerFormat;
  videoCodec: string;
  audioCodec: string;
  durationSeconds: number;
  width: number;
  height: number;
  sampleRate: number;
  channels: number;
};
