import path from "node:path";

import { BEEP_AUDIO_ENCODINGS, type BeepAudioCodec } from "./BeepAudioEncoding";
import { runFfmpegOrThrow } from "./runFfmpegOrThrow";

export type BeepAudioFile = {
  codec: BeepAudioCodec;
  fileName: string;
  filePath: string;
};

export type CreateBeepAudioFileOptions = {
  workDir: string;
  codec: BeepAudioCodec;
  seconds?: number;
  frequencyHz?: number;
  sampleRateHz?: number;
};

/**
 * Builds the audio track to insert at runtime instead of committing it.
 *
 * A beep is a pure sine wave, so `lavfi` can synthesise it with no input file,
 * and the result is loud and unambiguous — `detectAudioLoudness` can tell the
 * difference between "the beep landed" and "there is an empty audio stream".
 *
 * `-ac 2` is not optional. `sine` emits **mono**, while the video fixtures are
 * 48 kHz stereo, and ffmpeg's native `vorbis` encoder rejects anything that is
 * not exactly two channels.
 */
export async function createBeepAudioFile(options: CreateBeepAudioFileOptions): Promise<BeepAudioFile> {
  const { workDir, codec, seconds = 1, frequencyHz = 880, sampleRateHz = 48000 } = options;
  const encoding = BEEP_AUDIO_ENCODINGS[codec];
  const fileName = `beep-${codec}.${encoding.fileExtension}`;

  await runFfmpegOrThrow([
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequencyHz}:sample_rate=${sampleRateHz}`,
    "-t",
    String(seconds),
    "-ac",
    "2",
    "-ar",
    String(sampleRateHz),
    "-c:a",
    encoding.encoder,
    ...encoding.extraArgs,
    "-y",
    fileName,
  ], { cwd: workDir });

  return { codec, fileName, filePath: path.join(workDir, fileName) };
}
