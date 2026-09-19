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

export type MediaEditCommand =
  | {
      operation: "crop";
      source: MediaSource;
      fileName?: string;
      region: CropRegion;
      output?: { format?: VideoContainerFormat; videoCodec?: VideoCodec; audioCodec?: AudioCodec };
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
      job?: MediaToolJobOptions;
    }
  | {
      operation: "mute";
      source: MediaSource;
      fileName?: string;
      segments?: MuteSegment[];
      muteAll?: boolean;
      job?: MediaToolJobOptions;
    }
  | {
      operation: "add-audio";
      source: MediaSource;
      fileName?: string;
      tracks: AudioTrack[];
      job?: MediaToolJobOptions;
    }
  | {
      operation: "watermark";
      source: MediaSource;
      fileName?: string;
      layer: WatermarkLayer;
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
