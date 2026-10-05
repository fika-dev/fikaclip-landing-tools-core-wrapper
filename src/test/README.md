# Codec matrix tests

Container- and codec-level tests for the media editing repositories, run against
real media with the system `ffmpeg` binary.

```
npm run test:audio-addition   # build + run
npm run typecheck:test        # type-check tests (the build config excludes src/test)
```

## Layout

```
fixtures/videos/    33 committed 1-second samples + manifest.csv
support/            runtime adapter, fixture loading, probing, assertions
audio-addition/     one test file per container: mp4 / mov / webm / mkv
```

## Why it is built this way

**The repository's ffmpeg arguments are what is under test.** `NodeFfmpegMediaEditRuntime`
replaces ffmpeg.wasm with a temp directory and the system `ffmpeg`, then passes the
argument list through untouched. Tests never rebuild the invocation themselves — the
older `scripts/synthetic` suite does, which is why it cannot catch a wrong codec flag.

**Source media is committed; inserted audio is generated.** Encoding the samples at
test time would make the input depend on which encoders the local ffmpeg happens to
have (`libaom-av1` and `libvorbis` are missing on some builds), so the fixtures are
fixed bytes. The inserted beep is a pure sine, so `lavfi` can synthesise it anywhere.

**Loudness is measured, not assumed.** Codec names alone would also pass for an empty
audio stream, so `detectAudioLoudness` confirms audible samples actually arrived.

## Container rules the matrix encodes

| Container | Audio codecs it can carry | Why |
| --- | --- | --- |
| MP4 | AAC, MP3, Opus | Registration-based: a codec needs a defined sample entry |
| MOV | AAC, PCM, MP3, … | QuickTime grew as an editing format, so PCM is included |
| MKV | effectively any | Codec-agnostic: a track stores a codec ID plus private data |
| WebM | Opus, Vorbis only | A deliberately constrained Matroska profile for browsers |

Other things the tests depend on:

- ffprobe reports `matroska,webm` for both `.mkv` and `.webm`; only the extension separates them.
- Muxing is chosen by file extension, demuxing by file content — so the repository renaming an injected track to `<name>.<index>.input` is harmless.
- `h265` is `hevc` to ffprobe, and `pcm` is really `pcm_s16le`.
- `lavfi`'s `sine` is mono, and ffmpeg's native `vorbis` encoder accepts stereo only.

## Findings recorded by these tests

Two defects in the `add-audio` branch of `FfmpegMediaEditRepository` are currently
asserted as *present*. When either is fixed, the matching tests fail — that failure is
the signal to turn them into success assertions.

1. **WebM output always fails.** The branch hardcodes `-c:a aac` without looking at the
   container, so the WebM muxer rejects the header. `webm.test.ts` keeps a control case
   proving the same source, beep and filter graph succeed with `-c:a libopus`.
2. **The source audio is replaced, not mixed.** `buildMixFilter` feeds `amix` from the
   injected tracks only, and the branch maps `0:v?` plus `[mixed]`, so the original
   audio track is dropped. Each container file proves this by inserting a `volume: 0`
   beep and measuring silence.
