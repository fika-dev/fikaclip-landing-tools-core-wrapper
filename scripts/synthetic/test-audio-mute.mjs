import { runMediaEditTest } from "./media-editing-test-utils.mjs";

export async function testAudioMute() {
  await runMediaEditTest({
    label: "audio mute use case",
    outputName: "mute.mp4",
    args: ["-af", "volume=enable='between(t\\,0\\,0.05)':volume=0", "-c:v", "copy", "-c:a", "aac"],
    expected: { format: "mp4", videoCodec: "h264", audioCodec: "aac" },
  });
}
