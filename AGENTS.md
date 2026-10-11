# Agent Notes

## Architecture

- The library is split into `src/domain` and `src/data`.
- `src/domain` contains `entity`, `repository`, and `usecase`.
- Split `src/data` first by implementation boundary such as `browser`, `ffmpeg`, or `mediabunny`.
- Treat each top-level implementation directory as an independent module.
- An implementation module must not import another implementation module or choose between concrete engines.
- Only the composition root may know multiple implementation modules and wire them together.
- Keep one generic router repository in `src/domain`; do not add implementation-specific routers under `src/data`.
- The domain router gathers environment context through injected providers, asks every implementation for an assessment, and selects one implementation for the whole routed workflow.
- A routed `UseCase` declares common `before` and `after` repositories plus alternative implementations. Each implementation owns its complete ordered repository array.
- An implementation is eligible only when it can execute every requested step. Do not combine repositories from different implementations in one routed execution.
- Each data implementation owns its support rules and score. It may describe only its own strengths and constraints.
- A fallback implementation restarts from the entity captured before routing. It must not consume a failed implementation's partial entity.
- A data implementation must not refer to another implementation by import, type, identifier, or string.
- The domain router must not import concrete engines or contain engine-specific selection rules.
- Do not reintroduce root-level `model` or `service` directories.

## Naming

- Use `*UseCase` for use cases and app/client workflow factories.
- Use `*Repository` for repository interfaces and implementations.
- Entity names should be video-domain words, not library/vendor words.
- Repository and use case generics should take an entity type, including command-pattern entities.

## File Layout

- Keep one exported repository or use case concept per file.
- Do not create bucket files that group multiple repository interfaces, repository classes, constants, or objects.
- Avoid files named like `MediaRepositories.ts`, `UseCaseRepositories.ts`, or `VideoTypes.ts` when they only collect unrelated exports.
- Use `index.ts` only as a barrel export file.
- Private helper functions may stay in the file of the single exported concept they support.
- Entity files may group tightly related domain vocabulary when the names describe the same domain area.

## Implementation Rules

- Prefer `Repository<Entity> { execute(entity) }`.
- `UseCase<Entity>` should orchestrate an ordered list of repositories and return the final entity.
- Data implementations may use FFmpeg or browser APIs, but domain entities and repositories should stay vendor-neutral.
- Add new capabilities by implementing repositories under `src/data`; clients assemble them into use cases.
- Match existing app rules when a local convention exists, but do not force a common interface when it makes the code less type-safe.
- Media editing commands use a discriminated `MediaEditEntity`; keep operation-specific payloads in `MediaEditingTypes.ts` and expose one `*Repository` adapter per feature.

## Pull Request Convention

- PR titles must use `feat:`, `fix:`, `refactor:`, or `docs:` followed by a Korean change summary.
- PR bodies must start with a `Summary` section written in Korean.
- Keep a `Verification` section in the existing format with commands and results.
- Library PRs target `main`; this repository does not use a `staging` branch.

## Video Aspect Ratio Semantics

- The selected ratio describes the output frame.
- Preserve the source video's aspect ratio; never stretch it.
- Fit the video inside the selected frame by filling the longer dimension first, then center it.
- Fill only the remaining area with black padding. All four sides must not remain unused.
- Aspect-ratio transformation is a `pad` operation, not a `crop` operation. Do not remove source content unless a separate crop feature explicitly requests it.
