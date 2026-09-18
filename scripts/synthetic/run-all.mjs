import { testVideoAspectRatio } from "./test-video-aspect-ratio.mjs";
import { testVideoFormatConversion } from "./test-video-format-conversion.mjs";
import { testVideoCrop } from "./test-video-crop.mjs";
import { testAudioExtraction } from "./test-audio-extraction.mjs";
import { testAudioVolume } from "./test-audio-volume.mjs";
import { testAudioMute } from "./test-audio-mute.mjs";
import { testAudioAddition } from "./test-audio-addition.mjs";
import { testWatermark } from "./test-watermark.mjs";

await testVideoFormatConversion();
await testVideoAspectRatio();
await testVideoCrop();
await testAudioExtraction();
await testAudioVolume();
await testAudioMute();
await testAudioAddition();
await testWatermark();
console.log("Synthetic assembled use-case tests passed.");
