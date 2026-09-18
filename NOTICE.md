# FFmpeg Notice

This package includes a browser-side FFmpeg WebAssembly implementation under `src/data/ffmpeg` and generated runtime assets under `dist/runtime`.

Third-party components:

- `@ffmpeg/ffmpeg`: MIT
- `@ffmpeg/util`: MIT
- `@ffmpeg/core`: GPL-2.0-or-later

The `@ffmpeg/core` package supplies the `ffmpeg-core.js` and `ffmpeg-core.wasm` runtime files. Their package version, license identifier, source reference, and SHA-256 checksums are recorded in `LICENSES/README.md` and the generated `dist/runtime/MANIFEST.json`.

When publishing this package publicly, keep the generated `dist/runtime/MANIFEST.json`, this notice, full license texts, corresponding source archives, and build details with each released version.

This notice is a compliance aid, not legal advice.
