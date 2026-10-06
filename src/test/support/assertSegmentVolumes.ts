import assert from "node:assert/strict";

import type { AudioLoudness } from "./detectAudioLoudness";

export type ExpectedSegmentVolume = {
  /** What the operation was asked to multiply this slice by. 1 means "leave it". */
  volume: number;
  /** Shown in failure messages so the slice is identifiable. */
  label: string;
};

/**
 * Measurement error across a decode, a filter and an AAC re-encode.
 *
 * With the measurement windows kept clear of the range boundaries this lands
 * within 0.02 dB of theory, so the margin here is for variation between source
 * codecs rather than for the arithmetic.
 */
const TOLERANCE_DB = 0.5;

/** A volume multiplier in decibels: halving is -6.02 dB, doubling is +6.02 dB. */
export function volumeToDecibels(volume: number): number {
  return 20 * Math.log10(volume);
}

/**
 * Asserts each measured slice moved by exactly the gain it was asked for, and
 * that the slices nobody asked about did not move.
 *
 * Measuring the whole file cannot express either claim: a filter applied to the
 * wrong range, or to the whole track instead of one slice, still shifts the
 * overall average. Comparing slice by slice against the same slices of the
 * source is what pins "only this range, by only this much".
 */
export function assertSegmentVolumes(options: {
  outputSegments: readonly AudioLoudness[];
  sourceSegments: readonly AudioLoudness[];
  expected: readonly ExpectedSegmentVolume[];
}): void {
  const { outputSegments, sourceSegments, expected } = options;

  assert.equal(outputSegments.length, expected.length, "a measurement is needed for every expected slice");
  assert.equal(sourceSegments.length, expected.length, "the source must be measured over the same slices");

  expected.forEach(({ volume, label }, index) => {
    const output = outputSegments[index];
    const source = sourceSegments[index];

    if (volume === 0) {
      // Silence has no meaningful decibel value to compare against.
      assert.ok(output.isSilent, `${label}: expected silence, measured ${output.meanVolumeDb} dB`);
      return;
    }

    assert.ok(
      source.meanVolumeDb !== null && output.meanVolumeDb !== null,
      `${label}: both source and output slices must be measurable`,
    );

    const expectedGain = volumeToDecibels(volume);
    const actualGain = output.meanVolumeDb - source.meanVolumeDb;

    assert.ok(
      Math.abs(actualGain - expectedGain) <= TOLERANCE_DB,
      `${label}: expected ${expectedGain.toFixed(2)} dB for volume ${volume}, measured ${actualGain.toFixed(2)} dB ` +
        `(source ${source.meanVolumeDb} dB → output ${output.meanVolumeDb} dB)`,
    );
  });
}
