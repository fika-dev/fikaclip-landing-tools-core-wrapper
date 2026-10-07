import fs from "node:fs/promises";
import path from "node:path";

import type { AudioSegmentWindow } from "./AudioSegmentWindow";
import { decodeMediaStreams, type DecodeReport } from "./decodeMediaStreams";
import { detectAudioLoudness, type AudioLoudness } from "./detectAudioLoudness";
import { readFramePixels, type FramePixels } from "./FramePixels";
import { probeMediaProfile, type MediaProfile } from "./probeMediaProfile";

export type OutputMeasurement = {
  profile: MediaProfile;
  loudness: AudioLoudness;
  /** Present only when `captureFrame` was requested and the output has video. */
  frame?: FramePixels;
  /** Present only when `decodeCheck` was requested. */
  decode?: DecodeReport;
  /** Loudness per requested window, in the order the windows were given. */
  segments?: AudioLoudness[];
};

export type MeasureOutputBlobOptions = {
  /**
   * Decode the first frame so pixels can be asserted. Only worth the extra
   * decode for operations whose effect is visual.
   */
  captureFrame?: boolean;
  /**
   * Decode every stream to the end and collect decoder errors. Worth it for
   * operations that rewrite the container, where a header can look right while
   * the packets inside do not.
   */
  decodeCheck?: boolean;
  /**
   * Measure loudness over these slices as well as the whole file. Needed for any
   * claim about a specific time range rather than the output as a whole.
   */
  segmentWindows?: readonly AudioSegmentWindow[];
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

  const [profile, loudness, decode] = await Promise.all([
    probeMediaProfile(outputPath),
    detectAudioLoudness(outputPath),
    options.decodeCheck ? decodeMediaStreams(outputPath) : Promise.resolve(undefined),
  ]);
  const segments =
    options.segmentWindows === undefined
      ? undefined
      : await Promise.all(options.segmentWindows.map((window) => detectAudioLoudness(outputPath, { window })));
  const measurement: OutputMeasurement = {
    profile,
    loudness,
    ...(decode === undefined ? {} : { decode }),
    ...(segments === undefined ? {} : { segments }),
  };

  if (!options.captureFrame || profile.width === undefined || profile.height === undefined) {
    return measurement;
  }

  return {
    ...measurement,
    frame: await readFramePixels({ filePath: outputPath, workDir, width: profile.width, height: profile.height }),
  };
}
