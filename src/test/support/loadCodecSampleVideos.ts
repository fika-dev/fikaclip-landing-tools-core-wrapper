import fs from "node:fs";
import path from "node:path";

import type { VideoContainerFormat } from "../../domain";

import type { CodecSampleVideo } from "./CodecSampleVideo";
import { resolveFixturesDir } from "./resolveFixturesDir";

/**
 * Reads the sample manifest and returns every committed sample for a container.
 *
 * The manifest is the declaration; the files on disk are the material. Loading
 * through the manifest means a missing or renamed sample fails loudly here
 * instead of silently shrinking the matrix a test believes it covered.
 */
export function loadCodecSampleVideos(container: VideoContainerFormat): CodecSampleVideo[] {
  const fixturesDir = resolveFixturesDir();
  const manifestPath = path.join(fixturesDir, "manifest.csv");
  const rows = parseManifest(fs.readFileSync(manifestPath, "utf8"));
  const samples = rows
    .filter((row) => row.container === container)
    .map((row) => {
      const filePath = path.join(fixturesDir, container, row.file);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Manifest lists ${row.file} but the fixture is missing at ${filePath}.`);
      }

      return {
        fileName: row.file,
        filePath,
        container,
        videoCodec: row.video_codec,
        audioCodec: row.audio_codec,
        durationSeconds: Number(row.duration_seconds),
        width: Number(row.width),
        height: Number(row.height),
        sampleRate: Number(row.sample_rate),
        channels: Number(row.channels),
      };
    });

  if (samples.length === 0) {
    throw new Error(`The sample manifest at ${manifestPath} has no ${container} entries.`);
  }

  return samples;
}

function parseManifest(content: string): Record<string, string>[] {
  const [headerLine, ...lines] = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headers = headerLine.split(",");

  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}
