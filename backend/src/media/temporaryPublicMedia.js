import { randomUUID } from "node:crypto";

const records = new Map();
const DEFAULT_TTL_MS = positiveInt(process.env.QWEN_ASR_PUBLIC_MEDIA_TTL_MS, 15 * 60 * 1000);

// Qwen Filetrans can only read a public URL. This capability URL is deliberately
// short-lived and is released as soon as the asynchronous submission finishes.
export function registerTemporaryPublicMedia({
  path,
  contentType = "audio/mpeg",
  publicBaseUrl = process.env.SHIBEI_PUBLIC_BASE_URL || "",
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now()
} = {}) {
  const baseUrl = normalizePublicBaseUrl(publicBaseUrl);
  if (!path || !baseUrl) return null;
  purgeExpiredTemporaryMedia(now);
  const token = randomUUID();
  records.set(token, {
    path,
    contentType: String(contentType || "application/octet-stream"),
    expiresAt: now + ttlMs
  });
  return {
    url: `${baseUrl}/api/asr-media/${token}`,
    release: () => records.delete(token)
  };
}

export function takeTemporaryPublicMedia(token, { now = Date.now() } = {}) {
  purgeExpiredTemporaryMedia(now);
  const record = records.get(String(token || ""));
  return record ? { ...record } : null;
}

export function purgeExpiredTemporaryMedia(now = Date.now()) {
  for (const [token, record] of records) {
    if (record.expiresAt <= now) records.delete(token);
  }
}

export function normalizePublicBaseUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(url.hostname)) return "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
