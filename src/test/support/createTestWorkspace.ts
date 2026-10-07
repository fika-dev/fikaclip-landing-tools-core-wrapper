import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type TestWorkspace = {
  dir: string;
  cleanup: () => Promise<void>;
};

/**
 * One throwaway directory per case. Nothing is written inside the repository,
 * so the committed fixtures stay the only media files under version control.
 */
export async function createTestWorkspace(label: string): Promise<TestWorkspace> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fikaclip-${label}-`));

  return {
    dir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}
