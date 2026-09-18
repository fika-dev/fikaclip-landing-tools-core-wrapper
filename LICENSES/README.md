# Third-Party License Inventory

The browser runtime includes FFmpeg WebAssembly assets copied from the packages below during `npm run build`.

| Package | Version | License | Runtime assets | Source |
| --- | --- | --- | --- | --- |
| `@ffmpeg/core` | `0.12.10` | GPL-2.0-or-later | `ffmpeg-core.js`, `ffmpeg-core.wasm` | https://github.com/ffmpegwasm/ffmpeg.wasm |
| `@ffmpeg/ffmpeg` | `0.12.15` | MIT | JavaScript wrapper and worker support | https://github.com/ffmpegwasm/ffmpeg.wasm |
| `@ffmpeg/util` | `0.12.2` | MIT | Browser file utilities | https://github.com/ffmpegwasm/ffmpeg.wasm |

`dist/runtime/MANIFEST.json` records the exact package versions and SHA-256 checksums of copied runtime files for every build. The generated `dist/licenses/` directory contains the package license metadata and copied license files when the upstream package provides them.

The `@ffmpeg/core` WASM binary is distributed under GPL-2.0-or-later. Keep this inventory, `NOTICE.md`, the generated manifest, and the corresponding source/package references with every published artifact. This document is a compliance record, not legal advice.
