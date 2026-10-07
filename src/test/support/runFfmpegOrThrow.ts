import { spawnCommand, type CommandOutcome } from "./spawnCommand";

/**
 * Runs ffmpeg for test scaffolding (fixture creation, control experiments) where
 * a failure is a broken test rather than a finding about the library.
 *
 * `-nostdin` matters: the repository under test never passes `-y`, so without it
 * an existing output file would make ffmpeg block forever on an overwrite prompt.
 */
export async function runFfmpegOrThrow(args: string[], options: { cwd?: string } = {}): Promise<CommandOutcome> {
  const outcome = await spawnCommand("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", ...args], options);

  if (outcome.exitCode !== 0) {
    throw new Error(
      `ffmpeg ${args.join(" ")} failed with exit code ${outcome.exitCode}.\n--- stderr ---\n${outcome.stderr}`,
    );
  }

  return outcome;
}
