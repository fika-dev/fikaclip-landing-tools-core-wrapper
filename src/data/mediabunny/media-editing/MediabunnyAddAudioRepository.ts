import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Output,
  UrlSource,
  WebMOutputFormat,
} from "mediabunny";

import {
  type AddAudioRepository,
  createMediaProgressReporter,
  type MediaEditEntity,
  MediaEngineUnsupportedError,
  type MediaSource,
} from "../../../domain";

export class MediabunnyAddAudioRepository implements AddAudioRepository {
  readonly id = "mediabunny-add-audio";

  async execute(entity: MediaEditEntity): Promise<MediaEditEntity> {
    const { command, jobId } = entity;
    if (command.operation !== "add-audio") {
      throw new Error("Add audio repository received an invalid command.");
    }

    const inputs = [command.source, ...command.tracks.map((track) => track.source)].map(createInput);
    const [sourceInput, ...audioInputs] = inputs;
    const progress = createMediaProgressReporter(command.job, jobId, [
      { phase: "loading", weight: 0.05 },
      { phase: "probing", weight: 0.1 },
      { phase: "decoding", weight: 0.4 },
      { phase: "muxing", weight: 0.4 },
      { phase: "writing", weight: 0.05 },
    ]);

    try {
      progress.report("loading", 0);
      throwIfAborted(command.job?.signal);

      const videoTrack = await sourceInput.getPrimaryVideoTrack();
      const videoCodec = await videoTrack?.getCodec();
      const decoderConfig = await videoTrack?.getDecoderConfig();
      if (!videoTrack || !videoCodec || !decoderConfig || !["vp8", "vp9", "av1"].includes(videoCodec)) {
        throw new MediaEngineUnsupportedError("mediabunny", "The WebM video track cannot be copied by Mediabunny.");
      }

      progress.report("loading", 1);
      progress.report("probing", 0);
      const duration = await sourceInput.computeDuration();
      progress.report("probing", 1);
      const mixedAudio = await renderMixedAudio(
        sourceInput,
        audioInputs,
        duration,
        command.includeOriginalAudio !== false,
        command.tracks,
        command.job?.signal,
        (ratio) => progress.report("decoding", ratio),
      );
      progress.report("decoding", 1);
      throwIfAborted(command.job?.signal);

      const target = new BufferTarget();
      const format = new WebMOutputFormat();
      const output = new Output({ format, target });
      const videoSource = new EncodedVideoPacketSource(videoCodec);
      const audioSource = new AudioBufferSource({
        codec: "opus",
        bitrate: 128_000,
      });

      output.addVideoTrack(videoSource, {
        decoderConfig,
        rotation: await videoTrack.getRotation(),
      });
      output.addAudioTrack(audioSource);
      await output.start();

      const packetSink = new EncodedPacketSink(videoTrack);
      progress.report("muxing", 0);
      await Promise.all([
        (async () => {
          for await (const packet of packetSink.packets()) {
            throwIfAborted(command.job?.signal);
            await videoSource.add(packet);
            progress.report("muxing", duration > 0 ? packet.timestamp / duration : 0);
          }
        })(),
        audioSource.add(mixedAudio),
      ]);
      progress.report("muxing", 1);
      progress.report("writing", 0);
      await output.finalize();

      if (!target.buffer) throw new Error("Mediabunny completed without output data.");
      const blob = new Blob([target.buffer], { type: format.mimeType });
      progress.report("writing", 1);
      progress.done();

      return {
        ...entity,
        result: {
          operation: "add-audio",
          blob,
          fileName: createOutputFileName(command.fileName),
          mimeType: blob.type,
          sizeBytes: blob.size,
          warnings: [],
        },
      };
    } finally {
      inputs.forEach((input) => input.dispose());
    }
  }
}

async function renderMixedAudio(
  sourceInput: Input,
  audioInputs: Input[],
  duration: number,
  includeOriginalAudio: boolean,
  tracks: Extract<MediaEditEntity["command"], { operation: "add-audio" }>["tracks"],
  signal?: AbortSignal,
  onProgress?: (ratio: number) => void,
) {
  const sampleRate = 48_000;
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
  const context = new OfflineAudioContext(2, frameCount, sampleRate);
  const sources: Array<{ input: Input; volume: number; loop: boolean; startSeconds: number }> = [];

  if (includeOriginalAudio && (await sourceInput.getPrimaryAudioTrack())) {
    sources.push({ input: sourceInput, volume: 1, loop: false, startSeconds: 0 });
  }
  audioInputs.forEach((input, index) => {
    const track = tracks[index];
    sources.push({
      input,
      volume: track.volume ?? 1,
      loop: track.loop ?? false,
      startSeconds: Math.max(0, track.startSeconds ?? 0),
    });
  });

  for (const [sourceIndex, source] of sources.entries()) {
    throwIfAborted(signal);
    const audioTrack = await source.input.getPrimaryAudioTrack();
    if (!audioTrack || !(await audioTrack.canDecode())) continue;
    const trackDuration = await audioTrack.computeDuration();
    if (trackDuration <= 0 || source.startSeconds >= duration) continue;

    const gain = context.createGain();
    gain.gain.value = Math.max(0, source.volume);
    gain.connect(context.destination);
    const repeats = source.loop ? Math.ceil((duration - source.startSeconds) / trackDuration) : 1;

    for await (const { buffer, timestamp } of new AudioBufferSink(audioTrack).buffers()) {
      onProgress?.((sourceIndex + Math.min(1, timestamp / trackDuration)) / Math.max(1, sources.length));
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        const when = source.startSeconds + timestamp + repeat * trackDuration;
        if (when >= duration) break;
        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(gain);
        node.start(when);
      }
    }
  }

  throwIfAborted(signal);
  onProgress?.(0.95);
  return context.startRendering();
}

function createInput(source: MediaSource) {
  const mediaSource =
    source.type === "file"
      ? new BlobSource(source.file)
      : source.type === "blob"
        ? new BlobSource(source.blob)
        : new UrlSource(source.url);
  return new Input({ source: mediaSource, formats: ALL_FORMATS });
}

function createOutputFileName(fileName?: string) {
  const baseName = (fileName ?? "video").replace(/\.[^.]+$/, "");
  return `${baseName}-audio-added.webm`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
}
