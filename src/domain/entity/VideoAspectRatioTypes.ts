import type { AudioCodec, MediaSource, VideoCodec, VideoContainerFormat, VideoExportResult } from "./MediaTypes";
import type { MediaToolJobOptions } from "./MediaToolTypes";

export type VideoAspectRatio = "9:16" | "16:9" | "1:1" | "4:3";

export type EditVideoAspectRatioCommand = {
  source: MediaSource;
  fileName?: string;
  aspectRatio: VideoAspectRatio;
  output?: {
    format?: VideoContainerFormat;
    videoCodec?: VideoCodec;
    audioCodec?: AudioCodec;
  };
  job?: MediaToolJobOptions;
};

export type EditVideoAspectRatioDetails = {
  aspectRatio: VideoAspectRatio;
  output: {
    format: VideoContainerFormat;
    videoCodec: VideoCodec;
    audioCodec: AudioCodec;
  };
  warnings: string[];
};

export type EditVideoAspectRatioResult = VideoExportResult & {
  details: EditVideoAspectRatioDetails;
};

export type EditVideoAspectRatioEntity = {
  command: EditVideoAspectRatioCommand;
  jobId: string;
  result?: EditVideoAspectRatioResult;
};
