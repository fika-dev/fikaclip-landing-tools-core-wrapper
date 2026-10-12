import { AudioSample } from "mediabunny";

export type TimedGain = {
  startSeconds: number;
  endSeconds: number;
  gain: number;
};

export function applyTimedGains(sample: AudioSample, ranges: readonly TimedGain[]) {
  const frames = sample.numberOfFrames;
  const channels = sample.numberOfChannels;
  const data = new Float32Array(frames * channels);

  for (let channel = 0; channel < channels; channel += 1) {
    const plane = data.subarray(channel * frames, (channel + 1) * frames);
    sample.copyTo(plane, { format: "f32-planar", planeIndex: channel });
    for (let frame = 0; frame < frames; frame += 1) {
      const timestamp = sample.timestamp + frame / sample.sampleRate;
      const range = ranges.find((item) => timestamp >= item.startSeconds && timestamp < item.endSeconds);
      if (range) plane[frame] *= range.gain;
    }
  }

  return new AudioSample({
    data,
    format: "f32-planar",
    sampleRate: sample.sampleRate,
    numberOfChannels: channels,
    timestamp: sample.timestamp,
  });
}
