export type VideoContainerFormat = "mp4" | "webm" | "mov" | "mkv";

export type VideoCodec = "h264" | "h265" | "vp8" | "vp9" | "av1" | "copy";

export type AudioCodec = "aac" | "opus" | "mp3" | "copy" | "none";

export type VideoExportResult = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type Pixel = number;

export type Seconds = number;

export type Size = {
  width: Pixel;
  height: Pixel;
};

export type MediaSource =
  | {
      type: "file";
      file: File;
    }
  | {
      type: "blob";
      blob: Blob;
    }
  | {
      type: "url";
      url: string;
      crossOrigin?: "anonymous" | "use-credentials";
    };

export type MediaCodecInfo = {
  codec?: string;
  profile?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
};

export type AudioTrackInfo = MediaCodecInfo & {
  index: number;
  streamIndex: number;
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
};

export type MediaMetadata = {
  durationSeconds?: Seconds;
  size?: Size;
  frameRate?: number;
  video?: MediaCodecInfo;
  audio?: MediaCodecInfo;
  container?: string;
  mimeType?: string;
};
