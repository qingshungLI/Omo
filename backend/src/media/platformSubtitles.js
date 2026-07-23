import { normalizeTranscriptionPayload } from "./transcriptionResult.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const PREFERRED_LANGUAGES = ["zh-CN", "ai-zh", "zh-Hans", "source", "en-US"];

export async function fetchPlatformSubtitleTranscript({
  subtitles = null,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  preferredLanguages = PREFERRED_LANGUAGES
} = {}) {
  const subtitle = selectPreferredSubtitle(subtitles, preferredLanguages);
  if (!subtitle?.url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(subtitle.url, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.text();
    const segments = parseSubtitleBody(body, subtitle);
    if (!segments.length) return null;
    return normalizeTranscriptionPayload(
      { segments },
      { provider: `platform_subtitle:${subtitle.language || "unknown"}` }
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeSubtitleTracks(subtitles) {
  if (!subtitles || typeof subtitles !== "object") return [];
  if (Array.isArray(subtitles)) return subtitles.map(normalizeSubtitleTrack).filter(Boolean);
  return Object.entries(subtitles)
    .flatMap(([language, tracks]) => {
      const items = Array.isArray(tracks) ? tracks : [tracks];
      return items.map((track) => normalizeSubtitleTrack({ language, ...track }));
    })
    .filter(Boolean);
}

function selectPreferredSubtitle(subtitles, preferredLanguages) {
  const tracks = normalizeSubtitleTracks(subtitles);
  if (!tracks.length) return null;
  for (const language of preferredLanguages) {
    const match = tracks.find((track) => track.language === language && track.url);
    if (match) return match;
  }
  return tracks.find((track) => track.url) || null;
}

function normalizeSubtitleTrack(track) {
  const url = String(track?.url || "").trim();
  if (!url) return null;
  return {
    language: String(track?.language || "").trim(),
    url,
    format: String(track?.format ?? "").trim(),
    type: String(track?.type ?? "").trim()
  };
}

function parseSubtitleBody(body, subtitle) {
  const format = String(subtitle?.format || "").trim().toLowerCase();
  if (format === "bilibili-json" || looksLikeJson(body)) {
    const segments = parseBilibiliJson(body);
    if (segments.length || format === "bilibili-json") return segments;
  }
  return parseSrt(body);
}

function parseBilibiliJson(body) {
  try {
    const payload = JSON.parse(String(body || ""));
    const items = Array.isArray(payload?.body) ? payload.body : [];
    return items
      .map((item, index) => ({
        id: `subtitle-${String(index + 1).padStart(3, "0")}`,
        startSeconds: finiteNumber(item?.from),
        endSeconds: finiteNumber(item?.to),
        text: String(item?.content || "").replace(/<[^>]+>/g, "").trim()
      }))
      .filter((segment) => segment.text);
  } catch {
    return [];
  }
}

function looksLikeJson(body) {
  return String(body || "").trimStart().startsWith("{");
}

function parseSrt(body) {
  return String(body || "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map(parseSrtBlock)
    .filter(Boolean);
}

function parseSrtBlock(block, index) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  const timingIndex = lines.findIndex((line) => line.includes("-->"));
  if (timingIndex < 0) return null;
  const [startRaw, endRaw] = lines[timingIndex].split("-->").map((value) => value.trim());
  const text = lines
    .slice(timingIndex + 1)
    .join(" ")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (!text) return null;
  return {
    id: `subtitle-${String(index + 1).padStart(3, "0")}`,
    startSeconds: parseSrtTimestamp(startRaw),
    endSeconds: parseSrtTimestamp(endRaw),
    text
  };
}

function parseSrtTimestamp(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!match) return null;
  const [, hours, minutes, seconds, millis] = match;
  return Number(hours) * 3600
    + Number(minutes) * 60
    + Number(seconds)
    + Number(millis.padEnd(3, "0")) / 1000;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
