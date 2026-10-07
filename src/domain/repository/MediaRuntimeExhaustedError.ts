/**
 * Raised when the media runtime runs out of memory mid-operation.
 *
 * The repository reports it and stops; it does not tear the runtime down. With a
 * shared runtime that decision belongs to the owner, which is the only place
 * that knows whether other work is still in flight and whether recycling is
 * safe. A distinct type is what lets the owner recognise the case without
 * matching on message text.
 */
export class MediaRuntimeExhaustedError extends Error {
  constructor(public readonly reason?: unknown) {
    super("The media runtime ran out of memory. Try a smaller file, a shorter clip, or a lighter codec.");
    this.name = "MediaRuntimeExhaustedError";
  }
}
