import { runMediaEditTest } from "./media-editing-test-utils.mjs";

export async function testAudioVolume() {
  await runMediaEditTest({
    label: "audio volume use case",
    outputName: "volume.mp4",
    args: ["-af", "volume=enable='between(t\\,0\\,0.05)':volume=0.5", "-c:v", "copy", "-c:a", "aac"],
    expected: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
  });
}
