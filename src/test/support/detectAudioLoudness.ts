import { spawnCommand } from "./spawnCommand";

export type AudioLoudness = {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  /** Inaudible, which is not the same as mathematically zero — see the threshold. */
  isSilent: boolean;
};

/**
 * A lossy encoder never writes exact digital silence: feeding it zeroes still
 * produces a dither/quantisation floor, measured at about -91 dB for AAC here,
 * just under the -96 dB floor of 16-bit audio.
 *
 * Meanwhile the quietest fixture audio measures about -39 dB. The gap between
 * the two is wide enough that any threshold in between separates "the encoder
 * wrote silence" from "real audio is present", so exact -inf must not be the
 * test for silence.
 */
const SILENCE_THRESHOLD_DB = -60;

/**
 * Measures the loudness of the first audio stream with the `volumedetect` filter.
 *
 * Checking codec names only proves that *an* audio stream exists. This proves
 * that audible samples actually reached it, which is what distinguishes a real
 * audio insertion from an empty stream.
 *
 * `volumedetect` reports at info level, so this cannot run with `-loglevel error`.
 */
export async function detectAudioLoudness(filePath: string): Promise<AudioLoudness> {
  const outcome = await spawnCommand("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "info",
    "-i",
    filePath,
    "-map",
    "0:a:0",
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);

  if (outcome.exitCode !== 0) {
    return { meanVolumeDb: null, maxVolumeDb: null, isSilent: true };
  }

  const meanVolumeDb = parseVolumeDb(outcome.stderr, "mean_volume");
  const maxVolumeDb = parseVolumeDb(outcome.stderr, "max_volume");

  return {
    meanVolumeDb,
    maxVolumeDb,
    isSilent: meanVolumeDb === null || meanVolumeDb <= SILENCE_THRESHOLD_DB,
  };
}

function parseVolumeDb(stderr: string, label: string): number | null {
  const match = stderr.match(new RegExp(`${label}:\\s*(-?[\\d.]+|-inf)\\s*dB`));
  if (!match) return null;
  if (match[1] === "-inf") return Number.NEGATIVE_INFINITY;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
