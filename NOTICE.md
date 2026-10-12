# Third-Party Media Runtime Notice

This package includes browser-side FFmpeg WebAssembly and Mediabunny implementations under `src/data`.

Third-party components:

- `@ffmpeg/ffmpeg`: MIT
- `@ffmpeg/util`: MIT
- `@ffmpeg/core`: GPL-2.0-or-later
- `mediabunny`: MPL-2.0

Mediabunny provides the WebM container pipeline around the browser WebCodecs APIs. Its source is bundled into the package output. Keep the MPL-2.0 notice and source reference with distributed artifacts.

The `@ffmpeg/core` package supplies the `ffmpeg-core.js` and `ffmpeg-core.wasm` runtime files. Their package version, license identifier, source reference, and SHA-256 checksums are recorded in `LICENSES/README.md` and the generated `dist/runtime/MANIFEST.json`.

When publishing this package publicly, keep the generated `dist/runtime/MANIFEST.json`, this notice, full license texts, corresponding source archives, and build details with each released version.

This notice is a compliance aid, not legal advice.
