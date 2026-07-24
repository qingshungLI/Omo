import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runCommandWithTimeout } from "./ffmpegAudio.js";
import { createMediaExtractionError } from "./mediaErrors.js";

const DEFAULT_CHUNK_SECONDS = readPositiveInt(process.env.QWEN_ASR_CHUNK_SECONDS, 300);
const DEFAULT_TIMEOUT_MS = readPositiveInt(process.env.QWEN_ASR_CHUNKING_TIMEOUT_MS, 120_000);

export async function splitAudioForParallelAsr({
  inputPath,
  outputDir = join(dirname(inputPath || "."), "asr-chunks"),
  chunkSeconds = DEFAULT_CHUNK_SECONDS,
  ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  runCommand = runCommandWithTimeout
} = {}) {
  if (!inputPath) throw new Error("splitAudioForParallelAsr requires inputPath");
  await mkdir(outputDir, { recursive: true });
  const outputPattern = join(outputDir, "chunk-%03d.mp3");
  try {
    await runCommand(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libmp3lame",
      "-b:a", "32k",
      "-f", "segment",
      "-segment_time", String(chunkSeconds),
      "-reset_timestamps", "1",
      outputPattern
    ], { timeoutMs });
    const names = (await readdir(outputDir)).filter((name) => /^chunk-\d+\.mp3$/.test(name)).sort();
    const chunks = await Promise.all(names.map(async (name, index) => {
      const path = join(outputDir, name);
      const file = await stat(path);
      return {
        path,
        dir: outputDir,
        bytes: file.size,
        contentType: "audio/mpeg",
        isAudioOnly: true,
        startSeconds: index * chunkSeconds,
        chunkIndex: index
      };
    }));
    if (!chunks.length) throw new Error("ffmpeg did not create ASR chunks");
    return { dir: outputDir, chunks, chunkSeconds };
  } catch (error) {
    throw createMediaExtractionError("audio_chunking_failed", "长视频音频切片失败。", {
      retryable: true,
      provider: "ffmpeg",
      cause: error
    });
  }
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
