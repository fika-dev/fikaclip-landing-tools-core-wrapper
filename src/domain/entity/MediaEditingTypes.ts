import type { AudioCodec, MediaSource, VideoCodec, VideoContainerFormat, VideoExportResult } from "./MediaTypes";
import type { MediaToolJobOptions } from "./MediaToolTypes";

export type AudioFormat = "mp3" | "m4a" | "wav" | "ogg";

export type AudioVolumeSegment = {
  startSeconds: number;
  endSeconds: number;
  volume: number;
};

export type MuteSegment = {
  startSeconds: number;
  endSeconds: number;
};

export type AudioTrack = {
  source: MediaSource;
  fileName?: string;
  volume?: number;
  loop?: boolean;
  startSeconds?: number;
};

export type CropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WatermarkLayer = {
  image: MediaSource;
  fileName?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  opacity?: number;
};

/**
 * Where an operation should land: container and codecs.
 *
 * Shared by every operation so a caller can pass the final target down a chain —
 * ask for Opus at the volume step and the later WebM mux becomes a remux rather
 * than a second lossy encode. Any field left out is filled from the container's
 * own rules; see `resolveMediaOutputProfile`.
 */
export type MediaEditOutput = {
  format?: VideoContainerFormat;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
};

export type MediaEditCommand =
  | {
      operation: "crop";
      source: MediaSource;
      fileName?: string;
      region: CropRegion;
      output?: MediaEditOutput;
      job?: MediaToolJobOptions;
    }
  | {
      operation: "extract-audio";
      source: MediaSource;
      fileName?: string;
      format: AudioFormat;
      audioCodec?: Exclude<AudioCodec, "none" | "copy">;
      audioTrackIndex?: number;
      job?: MediaToolJobOptions;
    }
  | {
      operation: "adjust-volume";
      source: MediaSource;
      fileName?: string;
      segments: AudioVolumeSegment[];
      output?: MediaEditOutput;
      job?: MediaToolJobOptions;
    }
  | {
      operation: "mute";
      source: MediaSource;
      fileName?: string;
      segments?: MuteSegment[];
      muteAll?: boolean;
      output?: MediaEditOutput;
      job?: MediaToolJobOptions;
    }
  | {
      operation: "add-audio";
      source: MediaSource;
      fileName?: string;
      tracks: AudioTrack[];
      output?: MediaEditOutput;
      job?: MediaToolJobOptions;
    }
  | {
      operation: "watermark";
      source: MediaSource;
      fileName?: string;
      layer: WatermarkLayer;
      output?: MediaEditOutput;
      job?: MediaToolJobOptions;
    };

export type MediaEditEntity = {
  command: MediaEditCommand;
  jobId: string;
  result?: MediaEditResult;
};

export type MediaEditResult = VideoExportResult & {
  operation: MediaEditCommand["operation"];
  warnings: string[];
};
