import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_RELATIVE_PATH = path.join("src", "test", "fixtures");

/**
 * Locates the committed fixture root (`src/test/fixtures`) without depending on
 * the working directory.
 *
 * `npm run` starts in the package root, but a direct `node --test` or an IDE run
 * configuration can start anywhere, so the current directory is only the first
 * guess. The reliable anchor is this module's own location: walking up from it
 * reaches the package root from both the source tree (`src/test/support/`) and
 * the bundle (`dist-test/`).
 */
export function resolveFixturesDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const searchRoots = [process.cwd(), ...ancestorDirectories(moduleDir)];
  const candidates = searchRoots.map((root) => path.join(root, FIXTURES_RELATIVE_PATH));
  const found = candidates.find((candidate) => fs.existsSync(candidate));

  if (!found) {
    throw new Error(
      `Test fixtures were not found at ${FIXTURES_RELATIVE_PATH}. Looked under:\n${searchRoots.join("\n")}`,
    );
  }

  return found;
}

function ancestorDirectories(startDir: string): string[] {
  const directories: string[] = [];
  let current = startDir;

  while (true) {
    directories.push(current);

    const parent = path.dirname(current);
    if (parent === current) return directories;

    current = parent;
  }
}
