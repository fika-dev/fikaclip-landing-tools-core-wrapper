import type {
  AudioCodec,
  ConvertVideoFormatEntity,
  ConvertVideoFormatOutput,
  ConvertVideoFormatPlan,
  MediaMetadata,
  ResolvedConvertVideoFormatOutput,
  VideoCodec,
  VideoContainerFormat,
  VideoFormatConversionMode,
} from "../entity";
import { normalizeAudioCodec, normalizeVideoCodec } from "./MediaFormatNormalization";
import type { Repository } from "./Repository";

const DEFAULT_TARGET_CODECS: Record<VideoContainerFormat, { videoCodec: VideoCodec; audioCodec: AudioCodec }> = {
  mp4: { videoCodec: "h264", audioCodec: "aac" },
  webm: { videoCodec: "vp9", audioCodec: "opus" },
  mov: { videoCodec: "h264", audioCodec: "aac" },
  mkv: { videoCodec: "h264", audioCodec: "aac" },
};

export class CodecCompatibilityRepository implements Repository<ConvertVideoFormatEntity> {
  readonly id = "codec-compatibility";

  execute(entity: ConvertVideoFormatEntity): ConvertVideoFormatEntity {
    const { command, inputMetadata } = entity;
    const requestedMode = this.resolveConversionMode(command.mode, command.output);
    const requestedOutput = this.resolveOutput(command.output, requestedMode);
    const { mode, output, warnings } = this.optimizePlanForInput(
      command.output,
      requestedMode,
      requestedOutput,
      inputMetadata,
    );

    return {
      ...entity,
      plan: {
        mode,
        inputMetadata,
        output,
        warnings,
      },
    };
  }

  private resolveConversionMode(
    mode: ConvertVideoFormatEntity["command"]["mode"],
    output: ConvertVideoFormatOutput,
  ): Exclude<VideoFormatConversionMode, "auto"> {
    if (mode && mode !== "auto") {
      return mode;
    }

    return output.videoCodec || output.audioCodec || output.bitrate ? "transcode" : "remux";
  }

  private resolveOutput(
    output: ConvertVideoFormatOutput,
    mode: Exclude<VideoFormatConversionMode, "auto">,
  ): ResolvedConvertVideoFormatOutput {
    if (mode === "remux") {
      return {
        ...output,
        videoCodec: "copy",
        audioCodec: "copy",
      };
    }

    const defaults = DEFAULT_TARGET_CODECS[output.format];
    return {
      ...output,
      videoCodec: output.videoCodec ?? defaults.videoCodec,
      audioCodec: output.audioCodec ?? defaults.audioCodec,
    };
  }

  private optimizePlanForInput(
    requestedOutput: ConvertVideoFormatOutput,
    mode: Exclude<VideoFormatConversionMode, "auto">,
    output: ResolvedConvertVideoFormatOutput,
    inputMetadata: MediaMetadata | undefined,
  ) {
    if (!inputMetadata) {
      const warnings = this.createWarnings(requestedOutput, mode);
      warnings.push("Input metadata could not be inspected in this browser; conversion will continue.");
      return { mode, output, warnings };
    }

    if (mode === "remux") {
      const warnings = this.createWarnings(requestedOutput, mode);
      return { mode, output, warnings };
    }

    const inputVideoCodec = normalizeVideoCodec(inputMetadata.video?.codec);
    const inputAudioCodec = normalizeAudioCodec(inputMetadata.audio?.codec);
    const optimizedOutput: ResolvedConvertVideoFormatOutput = { ...output };
    const copyWarnings: string[] = [];

    if (!requestedOutput.bitrate && inputVideoCodec && inputVideoCodec === output.videoCodec) {
      optimizedOutput.videoCodec = "copy";
      copyWarnings.push("Video codec matches the source, so the video stream will be copied without re-encoding.");
    }

    if (inputAudioCodec && inputAudioCodec === output.audioCodec) {
      optimizedOutput.audioCodec = "copy";
      copyWarnings.push("Audio codec matches the source, so the audio stream will be copied without re-encoding.");
    }

    const optimizedMode: Exclude<VideoFormatConversionMode, "auto"> =
      optimizedOutput.videoCodec === "copy" && optimizedOutput.audioCodec === "copy" ? "remux" : mode;
    const warnings = [...this.createWarnings(optimizedOutput, optimizedMode), ...copyWarnings];

    return {
      mode: optimizedMode,
      output: optimizedOutput,
      warnings,
    };
  }

  private createWarnings(output: ConvertVideoFormatOutput, mode: Exclude<VideoFormatConversionMode, "auto">) {
    const warnings: string[] = [];

    if (mode === "remux") {
      warnings.push("Remux mode keeps original codecs and can fail if the target container does not support them.");
    }

    if (output.videoCodec === "h264" || output.videoCodec === "h265") {
      warnings.push("H.264/H.265 transcoding can require GPL-licensed FFmpeg builds depending on the encoder.");
    }

    return warnings;
  }
}
