import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runCommand(command, args) {
  try {
    return await execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
}

export async function probeMedia(filePath) {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=format_name:stream=codec_type,codec_name,width,height",
    "-of",
    "json",
    filePath,
  ]);
  const probe = JSON.parse(stdout);
  const streams = probe.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");

  return {
    format: normalizeFormat(probe.format?.format_name),
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    width: video?.width,
    height: video?.height,
  };
}

export async function assertMedia(filePath, expected) {
  const actual = await probeMedia(filePath);
  assertEqual(`${expected.label} container`, actual.format, expected.format);
  assertEqual(`${expected.label} video codec`, actual.videoCodec, expected.videoCodec);
  assertEqual(`${expected.label} audio codec`, actual.audioCodec, expected.audioCodec);
  if (expected.width !== undefined) assertEqual(`${expected.label} width`, actual.width, expected.width);
  if (expected.height !== undefined) assertEqual(`${expected.label} height`, actual.height, expected.height);
}

export function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function normalizeFormat(formatName) {
  const formats = String(formatName ?? "").split(",");
  if (formats.includes("webm")) return "webm";
  if (formats.includes("matroska")) return "mkv";
  if (formats.includes("mp4")) return "mp4";
  if (formats.includes("mov")) return "mov";
  return formats[0] ?? "";
}
