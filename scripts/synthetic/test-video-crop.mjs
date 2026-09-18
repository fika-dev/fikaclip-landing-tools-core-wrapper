import { runMediaEditTest } from "./media-editing-test-utils.mjs";

export async function testVideoCrop() {
  await runMediaEditTest({
    label: "video crop use case",
    outputName: "crop.mp4",
    args: ["-vf", "crop=192:192:64:0", "-c:v", "libx264", "-c:a", "aac"],
    expected: { format: "mp4", videoCodec: "h264", audioCodec: "aac", width: 192, height: 192 },
  });
}
