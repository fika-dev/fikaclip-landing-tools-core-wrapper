import fs from "node:fs/promises";

await fs.rm(new URL("../dist", import.meta.url), { force: true, recursive: true });
