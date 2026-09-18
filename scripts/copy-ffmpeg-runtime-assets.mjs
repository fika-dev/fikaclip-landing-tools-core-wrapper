import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const distDir = path.join(packageRoot, "dist");
const runtimeDir = path.join(distDir, "runtime");
const licensesDir = path.join(distDir, "licenses");

const corePackagePath = await resolvePackageJson("@ffmpeg/core");
const ffmpegPackagePath = await resolvePackageJson("@ffmpeg/ffmpeg");
const utilPackagePath = await resolvePackageJson("@ffmpeg/util");

const corePackage = JSON.parse(await fs.readFile(corePackagePath, "utf8"));
const ffmpegPackage = JSON.parse(await fs.readFile(ffmpegPackagePath, "utf8"));
const utilPackage = JSON.parse(await fs.readFile(utilPackagePath, "utf8"));
const coreDistDir = path.join(path.dirname(corePackagePath), "dist", "umd");
const ffmpegEsmDir = path.join(path.dirname(ffmpegPackagePath), "dist", "esm");

await fs.mkdir(runtimeDir, { recursive: true });
await fs.mkdir(licensesDir, { recursive: true });

const copiedFiles = [];
const copiedBundleFiles = [];

for (const fileName of ["worker.js", "const.js", "errors.js"]) {
  const source = path.join(ffmpegEsmDir, fileName);
  const target = path.join(distDir, fileName);
  const data = await fs.readFile(source);

  await fs.writeFile(target, data);
  copiedBundleFiles.push({
    name: fileName,
    bytes: data.byteLength,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  });
}

for (const fileName of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const source = path.join(coreDistDir, fileName);
  const target = path.join(runtimeDir, fileName);
  const data = await fs.readFile(source);

  await fs.writeFile(target, data);
  copiedFiles.push({
    name: fileName,
    bytes: data.byteLength,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  });
}

const manifest = {
  name: "@fikaclip/video-editor",
  version: JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8")).version,
  packages: {
    "@ffmpeg/core": {
      version: corePackage.version,
      license: corePackage.license,
    },
    "@ffmpeg/ffmpeg": {
      version: ffmpegPackage.version,
      license: ffmpegPackage.license,
    },
    "@ffmpeg/util": {
      version: utilPackage.version,
      license: utilPackage.license,
    },
  },
  runtimeFiles: copiedFiles,
  bundleFiles: copiedBundleFiles,
};

await fs.writeFile(path.join(runtimeDir, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(
  path.join(licensesDir, "THIRD_PARTY_LICENSES.json"),
  `${JSON.stringify(manifest.packages, null, 2)}\n`,
);
await fs.copyFile(path.join(packageRoot, "NOTICE.md"), path.join(distDir, "NOTICE.md"));

await copyLicenseFile("@ffmpeg/core", corePackagePath);
await copyLicenseFile("@ffmpeg/ffmpeg", ffmpegPackagePath);
await copyLicenseFile("@ffmpeg/util", utilPackagePath);

async function copyLicenseFile(packageName, packagePath) {
  const packageDir = path.dirname(packagePath);
  const entries = await fs.readdir(packageDir);
  const licenseFile = entries.find((entry) => /^licen[cs]e/i.test(entry));

  if (!licenseFile) {
    return;
  }

  await fs.copyFile(
    path.join(packageDir, licenseFile),
    path.join(licensesDir, `${packageName.replace("/", "__")}-${licenseFile}`),
  );
}

async function resolvePackageJson(packageName) {
  let currentDir = path.dirname(require.resolve(packageName));

  while (currentDir !== path.dirname(currentDir)) {
    const candidate = path.join(currentDir, "package.json");

    try {
      const candidatePackage = JSON.parse(await fs.readFile(candidate, "utf8"));

      if (candidatePackage.name === packageName) {
        return candidate;
      }
    } catch {
      // Keep walking toward the package root.
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Could not resolve package.json for ${packageName}.`);
}
