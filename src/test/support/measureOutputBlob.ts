import fs from "node:fs/promises";
import path from "node:path";

import { detectAudioLoudness, type AudioLoudness } from "./detectAudioLoudness";
import { readFramePixels, type FramePixels } from "./FramePixels";
import { probeMediaProfile, type MediaProfile } from "./probeMediaProfile";

export type OutputMeasurement = {
  profile: MediaProfile;
  loudness: AudioLoudness;
  /** Present only when `captureFrame` was requested and the output has video. */
  frame?: FramePixels;
};

export type MeasureOutputBlobOptions = {
  /**
   * Decode the first frame so pixels can be asserted. Only worth the extra
   * decode for operations whose effect is visual.
   */
  captureFrame?: boolean;
};

/**
 * Writes a result blob back to disk and measures it.
 *
 * Every repository deletes its own output from the runtime FS once it has read
 * the bytes, so the returned blob is the only copy. The probe file keeps the
 * result's extension because that is what tells ffprobe which demuxer to try.
 */
export async function measureOutputBlob(
  workDir: string,
  result: { blob: Blob; fileName: string },
  options: MeasureOutputBlobOptions = {},
): Promise<OutputMeasurement> {
  const outputPath = path.join(workDir, `probe-target${path.extname(result.fileName)}`);
  await fs.writeFile(outputPath, new Uint8Array(await result.blob.arrayBuffer()));

  const [profile, loudness] = await Promise.all([probeMediaProfile(outputPath), detectAudioLoudness(outputPath)]);

  if (!options.captureFrame || profile.width === undefined || profile.height === undefined) {
    return { profile, loudness };
  }

  const frame = await readFramePixels({
    filePath: outputPath,
    workDir,
    width: profile.width,
    height: profile.height,
  });

  return { profile, loudness, frame };
}
