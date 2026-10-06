import { describe, it } from "node:test";

import type { VideoContainerFormat } from "../../index";
import { assertSampleMatchesManifest, loadCodecSampleVideos } from "../support";

const CONTAINERS: VideoContainerFormat[] = ["mp4", "mov", "webm", "mkv"];

/**
 * Verifies every committed sample against the manifest, once for the whole
 * suite.
 *
 * Operation tests take the fixtures as given. If a sample were mislabelled or
 * re-encoded, those tests would keep passing while asserting things about the
 * wrong codec, so the claim is checked here instead of being repeated per
 * operation.
 */
describe("코덱 샘플 픽스처가 매니페스트와 일치하는지", () => {
  for (const container of CONTAINERS) {
    describe(container, () => {
      for (const sample of loadCodecSampleVideos(container)) {
        it(`${sample.fileName} 은 ${sample.videoCodec}/${sample.audioCodec} 이다`, async () => {
          await assertSampleMatchesManifest(sample);
        });
      }
    });
  }
});
