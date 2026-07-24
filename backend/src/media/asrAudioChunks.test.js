import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { splitAudioForParallelAsr } from "./asrAudioChunks.js";

test("creates low-bitrate timestamped chunks for parallel ASR", async () => {
  const root = await mkdtemp(join(tmpdir(), "shibei-asr-chunks-"));
  try {
    let args = [];
    const result = await splitAudioForParallelAsr({
      inputPath: join(root, "source.m4a"),
      outputDir: join(root, "chunks"),
      chunkSeconds: 300,
      runCommand: async (_command, receivedArgs) => {
        args = receivedArgs;
        const pattern = receivedArgs.at(-1);
        await writeFile(pattern.replace("%03d", "000"), "chunk-a");
        await writeFile(pattern.replace("%03d", "001"), "chunk-b");
      }
    });
    assert.equal(args.includes("32k"), true);
    assert.equal(args.includes("300"), true);
    assert.deepEqual(result.chunks.map((chunk) => chunk.startSeconds), [0, 300]);
    assert.equal(result.chunks[0].contentType, "audio/mpeg");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
