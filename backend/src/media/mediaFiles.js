import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMediaExtractionError } from "./mediaErrors.js";
import { VIDEO_DEFAULTS } from "./videoDefaults.js";

const DEFAULT_MAX_BYTES = readPositiveInt(process.env.VIDEO_MEDIA_MAX_BYTES, VIDEO_DEFAULTS.mediaMaxBytes);
const DEFAULT_TIMEOUT_MS = readPositiveInt(process.env.VIDEO_MEDIA_FETCH_TIMEOUT_MS, VIDEO_DEFAULTS.mediaFetchTimeoutMs);

export async function downloadMediaToTempFile({
  mediaUrl,
  mediaUrls = [],
  headers = {},
  fetchImpl = fetch,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  candidateTimeoutMs = readPositiveInt(process.env.VIDEO_MEDIA_CANDIDATE_TIMEOUT_MS, 45_000)
} = {}) {
  const candidates = normalizeMediaUrls(mediaUrls, mediaUrl);
  let lastError = null;
  for (const candidateUrl of candidates) {
    try {
      return await downloadSingleMediaToTempFile({
        mediaUrl: candidateUrl,
        headers,
        fetchImpl,
        maxBytes,
        timeoutMs: candidates.length > 1 ? Math.min(timeoutMs, candidateTimeoutMs) : timeoutMs
      });
    } catch (error) {
      lastError = error;
      if (error?.mediaErrorType === "video_media_too_large" || error?.retryable === false) {
        throw error;
      }
    }
  }
  if (lastError) throw lastError;
  throw createMediaExtractionError("video_media_url_missing", "视频内容暂时无法读取，请稍后重试。", {
    retryable: false
  });
}

async function downloadSingleMediaToTempFile({
  mediaUrl,
  headers,
  fetchImpl,
  maxBytes,
  timeoutMs
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let dir = null;
  try {
    const response = await fetchImpl(mediaUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: sanitizeDownloadHeaders(headers)
    });
    if (!response.ok) {
      throw createMediaExtractionError("video_media_unavailable", "视频内容暂时无法读取，请稍后重试。", {
        retryable: response.status >= 500,
        status: response.status
      });
    }
    const contentType = response.headers?.get?.("content-type") || response.headers?.get?.("Content-Type") || "";
    const contentLength = readContentLength(response.headers);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw createMediaExtractionError("video_media_too_large", "视频文件过大，暂时无法生成复习内容。", {
        retryable: false
      });
    }
    dir = join(tmpdir(), `shibei-video-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
    const path = join(dir, "source-video");
    const bytes = await writeResponseBodyToFile(response, path, { maxBytes });
    return { path, dir, bytes, contentType, sourceUrl: mediaUrl };
  } catch (error) {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    if (error?.name === "AbortError") {
      throw createMediaExtractionError("video_media_timeout", "读取视频内容超时，请稍后重试。", {
        retryable: true
      });
    }
    if (error?.code === "failed_extract_video") throw error;
    throw createMediaExtractionError("video_media_unavailable", "视频内容暂时无法读取，请稍后重试。", {
      retryable: true,
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMediaUrls(mediaUrls, mediaUrl) {
  const values = [
    ...(Array.isArray(mediaUrls) ? mediaUrls : []),
    mediaUrl
  ];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function sanitizeDownloadHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const allowed = new Set(["accept", "referer", "user-agent"]);
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [String(key).toLowerCase(), String(value || "").trim()])
      .filter(([key, value]) => allowed.has(key) && value)
  );
}

export async function cleanupMediaTempFiles(...files) {
  const dirs = files.flat().map((file) => file?.dir).filter(Boolean);
  await Promise.all([...new Set(dirs)].map((dir) => rm(dir, { recursive: true, force: true }).catch(() => {})));
}

async function writeResponseBodyToFile(response, path, { maxBytes }) {
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw createMediaExtractionError("video_media_too_large", "视频文件过大，暂时无法生成复习内容。", {
        retryable: false
      });
    }
    await writeFile(path, buffer);
    return buffer.byteLength;
  }

  const reader = response.body.getReader();
  const stream = createWriteStream(path);
  let bytes = 0;
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel?.().catch(() => {});
        throw createMediaExtractionError("video_media_too_large", "视频文件过大，暂时无法生成复习内容。", {
          retryable: false
        });
      }
      if (!stream.write(chunk)) {
        await once(stream, "drain");
      }
    }
    stream.end();
    await once(stream, "finish");
    finished = true;
    return bytes;
  } finally {
    reader.releaseLock?.();
    if (!finished) {
      stream.destroy();
    }
  }
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function readContentLength(headers) {
  const value = headers?.get?.("content-length") || headers?.get?.("Content-Length") || "";
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
