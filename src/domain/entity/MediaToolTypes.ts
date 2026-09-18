import type {
  AudioCodec,
  MediaMetadata,
  MediaSource,
  VideoCodec,
  VideoContainerFormat,
  VideoExportResult,
} from "./MediaTypes";

export type MediaToolProgressPhase = "loading" | "probing" | "remuxing" | "transcoding" | "writing" | "done";

export type MediaToolProgress = {
  jobId: string;
  phase: MediaToolProgressPhase;
  ratio?: number;
  message?: string;
};

export type MediaToolJobOptions = {
  jobId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: MediaToolProgress) => void;
};

export type MediaInspectionCommand = {
  source: MediaSource;
  fileName?: string;
  job?: MediaToolJobOptions;
};

export type MediaInspectionResult = {
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  metadata: MediaMetadata;
  format?: VideoContainerFormat;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  rawFormat?: string;
  rawVideoCodec?: string;
  rawAudioCodec?: string;
};

export type VideoUploadPolicyOperation = "inspect" | "remux" | "transcode" | "heavy-transcode";

export type BrowserCapabilitySnapshot = {
  deviceMemoryGb?: number;
  cpuCores?: number;
  availableStorageBytes?: number;
  isMobile: boolean;
  isLikelyInAppBrowser: boolean;
  isStorageEstimateSupported: boolean;
  isDeviceMemorySupported: boolean;
};

export type GetVideoUploadPolicyCommand = {
  operation?: VideoUploadPolicyOperation;
};

export type VideoUploadPolicy = {
  maxFileSizeBytes: number;
  minFileSizeBytes: number;
  operation: VideoUploadPolicyOperation;
  confidence: "high" | "medium" | "low";
  environment: BrowserCapabilitySnapshot;
  reasons: string[];
};

export type MediaLayerId = string;

export type MediaWorkflowInput =
  | {
      id: MediaLayerId;
      kind: "video";
      source: MediaSource;
      fileName?: string;
      metadata?: MediaMetadata;
    }
  | {
      id: MediaLayerId;
      kind: "audio";
      source: MediaSource;
      fileName?: string;
      metadata?: MediaMetadata;
    }
  | {
      id: MediaLayerId;
      kind: "image";
      source: MediaSource;
      fileName?: string;
      frame?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };

export type VideoFormatConversionMode = "auto" | "remux" | "transcode";

export type ConvertVideoFormatOutput = {
  format: VideoContainerFormat;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  bitrate?: number;
};

export type ConvertVideoFormatCommand = {
  source: MediaSource;
  fileName?: string;
  output: ConvertVideoFormatOutput;
  mode?: VideoFormatConversionMode;
  job?: MediaToolJobOptions;
};

export type ConvertVideoFormatDetails = {
  mode: Exclude<VideoFormatConversionMode, "auto">;
  inputMetadata?: MediaMetadata;
  output: ConvertVideoFormatOutput;
  warnings: string[];
};

export type ConvertVideoFormatResult = VideoExportResult & {
  details: ConvertVideoFormatDetails;
};

export type ResolvedConvertVideoFormatOutput = Required<
  Pick<ConvertVideoFormatOutput, "format" | "videoCodec" | "audioCodec">
> &
  Pick<ConvertVideoFormatOutput, "bitrate">;

export type ConvertVideoFormatPlan = Omit<ConvertVideoFormatDetails, "output"> & {
  output: ResolvedConvertVideoFormatOutput;
};

export type GetUploadPolicyEntity = {
  command: GetVideoUploadPolicyCommand;
  capability?: BrowserCapabilitySnapshot;
  result?: VideoUploadPolicy;
};

export type BrowserCapabilityEntity = {
  result?: BrowserCapabilitySnapshot;
};

export type InspectMediaEntity = {
  command: MediaInspectionCommand;
  jobId: string;
  result?: MediaInspectionResult;
};

export type ConvertVideoFormatEntity = {
  command: ConvertVideoFormatCommand;
  jobId: string;
  inputMetadata?: MediaMetadata;
  plan?: ConvertVideoFormatPlan;
  result?: ConvertVideoFormatResult;
};
