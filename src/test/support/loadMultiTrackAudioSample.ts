import fs from "node:fs";
import path from "node:path";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { resolveFixturesDir } from "./resolveFixturesDir";

/**
 * Nominal level of each audio track in the multi-track fixture, in dB.
 *
 * The three tracks carry the same tone at deliberately different levels, 20 dB
 * apart. Frequency would have been the obvious way to tell them apart, but
 * nothing in this suite can measure frequency — loudness it can, so the level
 * *is* each track's identity here.
 */
export const MULTI_TRACK_LEVELS_DB = [-24, -44, -64] as const;

const FILE_NAME = "three-audio-tracks-1s.mp4";

/**
 * A sample carrying three audio tracks, for observing what an operation does
 * when a source has more than one.
 */
export function loadMultiTrackAudioSample(): CodecSampleVideo {
  const filePath = path.join(resolveFixturesDir(), "multi-track", FILE_NAME);

  if (!fs.existsSync(filePath)) {
    throw new Error(`The multi-track fixture is missing at ${filePath}.`);
  }

  return {
    fileName: FILE_NAME,
    filePath,
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    durationSeconds: 1,
    width: 640,
    height: 360,
    sampleRate: 48000,
    channels: 2,
  };
}
