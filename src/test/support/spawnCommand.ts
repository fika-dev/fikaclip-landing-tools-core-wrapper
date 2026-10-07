import { spawn } from "node:child_process";

export type CommandOutcome = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * Runs a child process and resolves with its exit code instead of rejecting on
 * failure. The media-edit runtime contract hands the exit code back to the
 * repository under test, which is the component that decides how to fail, so
 * the runner must not swallow or translate a non-zero exit.
 */
export function spawnCommand(
  command: string,
  args: string[],
  options: { cwd?: string; signal?: AbortSignal } = {},
): Promise<CommandOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      signal: options.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));
  });
}
