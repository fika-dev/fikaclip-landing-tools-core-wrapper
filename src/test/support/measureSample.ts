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
};

/**
 * Measures a fixture the same way outputs are measured, so an operation can be
 * compared against its own input.
 *
 * "The rest of the picture is unchanged" and "the audio was not re-encoded" are
 * claims about a difference, and a difference needs both sides measured. Reading
 * the source here is what makes those assertions mean anything.
 */
export async function measureSample(sample: CodecSampleVideo): Promise<SampleMeasurement> {
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

    return { profile, loudness, frame, decode };
  } finally {
    await workspace.cleanup();
  }
}
