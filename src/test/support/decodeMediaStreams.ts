import { spawnCommand } from "./spawnCommand";

export type DecodeReport = {
  exitCode: number;
  /** Decoder complaints, one per line. Empty means every packet decoded cleanly. */
  errorLines: string[];
  /** Frames actually decoded from the first video stream, or undefined if there is none. */
  videoFrameCount?: number;
};

/**
 * Decodes every stream from start to finish and reports what the decoder said.
 *
 * Probing only reads headers, so a file whose header is fine but whose packets
 * are truncated or mislabelled still probes clean — the `.wav` extraction bug
 * looked perfectly healthy until something tried to decode it. Discarding the
 * output to `null` means this costs a decode and nothing else.
 */
export async function decodeMediaStreams(filePath: string): Promise<DecodeReport> {
  const decode = await spawnCommand("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-v",
    "error",
    "-i",
    filePath,
    "-map",
    "0",
    "-f",
    "null",
    "-",
  ]);
  const errorLines = decode.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    exitCode: decode.exitCode,
    errorLines,
    videoFrameCount: await countVideoFrames(filePath),
  };
}

/**
 * Counts frames by decoding rather than by trusting the container's metadata,
 * which is what makes it comparable across a transcode.
 */
async function countVideoFrames(filePath: string): Promise<number | undefined> {
  const probe = await spawnCommand("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=nb_read_frames",
    "-of",
    "csv=p=0",
    filePath,
  ]);
  // `-of csv=p=0` still emits a trailing separator, so the digits have to be
  // pulled out rather than handed straight to Number().
  const digits = probe.stdout.match(/\d+/);
  const count = digits === null ? Number.NaN : Number(digits[0]);

  return probe.exitCode === 0 && Number.isFinite(count) ? count : undefined;
}
