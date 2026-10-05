import type { CodecSampleVideo } from "./CodecSampleVideo";

/**
 * Picks one sample to act as the fixed variable while another axis is swept.
 *
 * Insert-codec coverage and source-codec coverage are independent concerns, so
 * each is swept against a pinned counterpart instead of running the full cross
 * product, which would multiply runtime without testing anything new.
 */
export function pickSample(
  samples: CodecSampleVideo[],
  selector: { videoCodec: string; audioCodec: string },
): CodecSampleVideo {
  const sample = samples.find(
    (candidate) => candidate.videoCodec === selector.videoCodec && candidate.audioCodec === selector.audioCodec,
  );

  if (!sample) {
    throw new Error(
      `No ${selector.videoCodec}/${selector.audioCodec} sample among: ${samples.map((item) => item.fileName).join(", ")}`,
    );
  }

  return sample;
}
