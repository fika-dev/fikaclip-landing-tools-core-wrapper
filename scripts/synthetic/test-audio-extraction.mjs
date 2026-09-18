import { runMediaEditTest } from "./media-editing-test-utils.mjs";

export async function testAudioExtraction() {
  await runMediaEditTest({
    label: "audio extraction use case",
    outputName: "audio.mp3",
    args: ["-vn", "-c:a", "libmp3lame"],
    expected: { format: "mp3", audioCodec: "mp3" },
  });
}
