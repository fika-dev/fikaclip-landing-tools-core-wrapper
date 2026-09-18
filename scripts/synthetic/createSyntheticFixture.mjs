import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCommand } from "./utils.mjs";

export async function createSyntheticFixture() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "fikaclip-usecases-"));
  const inputPath = path.join(workDir, "input.mp4");

  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x192:r=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:sample_rate=48000",
    "-t",
    "0.1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    inputPath,
  ]);

  return {
    inputPath,
    workDir,
    cleanup: () => fs.rm(workDir, { recursive: true, force: true }),
  };
}
