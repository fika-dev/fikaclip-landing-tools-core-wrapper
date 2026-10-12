export class MediaEngineUnsupportedError extends Error {
  readonly name = "MediaEngineUnsupportedError";

  constructor(
    readonly engine: string,
    message: string,
  ) {
    super(message);
  }
}
