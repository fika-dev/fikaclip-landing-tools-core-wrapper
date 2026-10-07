import type { AudioSegmentWindow } from "./AudioSegmentWindow";
import { createTestWorkspace } from "./createTestWorkspace";
import { decodeMediaStreams, type DecodeReport } from "./decodeMediaStreams";
import { detectAudioLoudness, type AudioLoudness } from "./detectAudioLoudness";
import { readFramePixels, type FramePixels } from "./FramePixels";
import { probeMediaProfile, type MediaProfile } from "./probeMediaProfile";
import type { CodecSampleVideo } from "./CodecSampleVideo";

export type SampleMeasurement = {
  profile: MediaProfile;
  loudness: AudioLoudness;
  frame: FramePixels;
  decode: DecodeReport;
  /** Loudness per requested window, in the order the windows were given. */
  segments?: AudioLoudness[];
};

/**
 * Measures a fixture the same way outputs are measured, so an operation can be
 * compared against its own input.
 *
 * "The rest of the picture is unchanged" and "the audio was not re-encoded" are
 * claims about a difference, and a difference needs both sides measured. Reading
 * the source here is what makes those assertions mean anything.
 */
export type MeasureSampleOptions = {
  /** Slices to measure as well as the whole file, for before/after comparison. */
  segmentWindows?: readonly AudioSegmentWindow[];
};

export async function measureSample(
  sample: CodecSampleVideo,
  options: MeasureSampleOptions = {},
): Promise<SampleMeasurement> {
  const workspace = await createTestWorkspace(`measure-${sample.container}`);

  try {
    const [profile, loudness, decode] = await Promise.all([
      probeMediaProfile(sample.filePath),
      detectAudioLoudness(sample.filePath),
      decodeMediaStreams(sample.filePath),
    ]);
    const frame = await readFramePixels({
      filePath: sample.filePath,
      workDir: workspace.dir,
      width: sample.width,
      height: sample.height,
    });

    const segments =
      options.segmentWindows === undefined
        ? undefined
        : await Promise.all(
            options.segmentWindows.map((window) => detectAudioLoudness(sample.filePath, { window })),
          );

    return { profile, loudness, frame, decode, ...(segments === undefined ? {} : { segments }) };
  } finally {
    await workspace.cleanup();
  }
}
