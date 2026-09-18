# FikaClip Video Editor

Browser video editing domain, use case, and repository implementations for FikaClip.

This package owns the video-editing library layer. Client apps should assemble use cases from exported repositories and expose their own UI-facing facade. Apps should not import `@ffmpeg/*` or know which library performs probing, planning, transcoding, or cleanup.

## Architecture

The source is split into two main layers:

- `src/domain/entity`: video-domain words and workflow state, such as media sources, codecs, upload policies, conversion entities, metadata, and results.
- `src/domain/repository`: repository ports plus domain repository steps. Repositories follow a common `Repository<Entity>` shape whenever practical.
- `src/domain/usecase`: generic workflow runner. `UseCase<Entity>` executes repositories in the order supplied by the client.
- `src/data`: concrete repository implementations, grouped by capability or feature. Browser probing, browser capability detection, and FFmpeg transcoding live here.

Current use case shape:

```ts
const convertVideoFormatUseCase = new UseCase<ConvertVideoFormatEntity>([
  new CreateVideoFormatConversionPlanRepository(mediaProbeRepository, codecCompatibilityRepository),
  new TranscodeVideoFormatRepository(mediaTranscodeRepository),
]);

const entity = await convertVideoFormatUseCase.execute({
  command,
  jobId: command.job?.jobId ?? "convert",
});
```

The use case returns the final entity. The client facade decides how to unwrap `entity.result`.

## Video Aspect Ratio Definition

The requested aspect ratio is the **target frame**, not a request to stretch or crop the source video.
The transformation rules are:

1. Create a frame with the requested ratio (`9:16`, `16:9`, `1:1`, or `4:3`).
2. Preserve the source video's original width-to-height ratio.
3. Scale the video until its longer dimension fills the corresponding frame dimension.
4. Center the video in the frame and fill only the remaining space with black padding.

Therefore, at least one frame edge is always occupied by the video; there is never unused space on all four sides. For example, a `9:16` source in a `16:9` frame fills the frame height, stays centered, and receives black padding on the left and right. Aspect-ratio editing uses FFmpeg `pad`, not `crop`, so the source image is not clipped. Because padding changes the video frame, the video stream must be encoded rather than copied.

## Repository Rules

Use `*Repository` for repository classes and interfaces. Use `*UseCase` for use case classes, factories, and client-side assembled workflows.

Keep one exported repository or use case concept per file. Do not create bucket files that group multiple repository interfaces, repository classes, constants, or objects such as `MediaRepositories.ts` or `UseCaseRepositories.ts`. Use `index.ts` only as a barrel export file. Entity files may group tightly related vocabulary when the names describe the same domain area.

Repositories should use `Repository<Entity>` and implement:

```ts
execute(entity: Entity): Entity | Promise<Entity>
```

The generic parameter should be an entity, including command-pattern entities such as `ConvertVideoFormatEntity`. Avoid `Repository<Input, Output>` unless the app has a strong local precedent and forcing entity flow would make the code worse.

Entity names should be actual video-domain words. Prefer names like `MediaSource`, `MediaMetadata`, `ConvertVideoFormatEntity`, `VideoUploadPolicy`, and `MediaLayerId` over transport or library-specific names.

## Adding Features

When adding a feature:

1. Add or extend entity types in `src/domain/entity`.
2. Add repository ports or domain repository steps in `src/domain/repository`.
3. Implement concrete repositories in `src/data/<feature-or-capability>`.
4. Let the consuming app assemble `new UseCase<Entity>([repositories...])` in the order it needs.
5. Keep vendor-specific details, such as FFmpeg arguments and runtime cleanup, inside `src/data`.
6. Keep each new repository interface or implementation in its own file and export it from the nearest `index.ts`.

The library should not need a new exported custom use case class for every feature. Prefer one generic `UseCase<Entity>` plus composable repositories.

Media editing capabilities use `MediaEditEntity` with a discriminated `command.operation`. The data layer exposes feature repositories such as `FfmpegCropVideoRepository`, `FfmpegExtractAudioRepository`, `FfmpegAdjustAudioVolumeRepository`, `FfmpegMuteAudioRepository`, `FfmpegAddAudioRepository`, and `FfmpegWatermarkVideoRepository`. Clients compose one of these repositories with the generic `UseCase<MediaEditEntity>`; no feature-specific workflow runner is required.

## Build

```sh
npm install
npm run build
```

The build writes FFmpeg runtime files to:

```text
dist/runtime/
  ffmpeg-core.js
  ffmpeg-core.wasm
  MANIFEST.json

dist/worker.js
dist/const.js
dist/errors.js
```

The worker files are required beside the bundled entry point because the FFmpeg
wrapper creates its worker with a relative module URL. Serve `ffmpeg-core.wasm`
with `Content-Type: application/wasm`.
