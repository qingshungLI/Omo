import { createMediaExtractionError } from "./mediaErrors.js";
import { normalizeSubtitleTracks } from "./platformSubtitles.js";
import { normalizeVideoSourceUrl } from "./videoPlatforms.js";

const DEFAULT_TIMEOUT_MS = readPositiveInt(process.env.BILIBILI_API_TIMEOUT_MS, 20_000);
const BILIBILI_API_ROOT = "https://api.bilibili.com";
const DEFAULT_USER_AGENT = "Mozilla/5.0 Recallo/0.1";

export async function fetchBilibiliVideoSource({
  sourceUrl,
  sessionData = process.env.BILIBILI_SESSDATA || process.env.BILIBILI_SESSION_TOKEN || "",
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const initialSource = normalizeVideoSourceUrl(sourceUrl);
  const headers = buildApiHeaders(sessionData);
  const source = await resolveBilibiliSourceUrl({
    source: initialSource,
    headers,
    fetchImpl,
    timeoutMs
  });
  const target = parseBilibiliTarget(source);
  const view = await requestBilibiliJson({
    url: buildViewUrl(target),
    headers,
    fetchImpl,
    timeoutMs
  });
  const page = selectPage(view.pages, target.pageNumber);
  const aid = finitePositiveNumber(view.aid);
  const cid = finitePositiveNumber(page?.cid || view.cid);
  if (!aid || !cid) {
    throw providerError("provider_invalid_response", "B 站视频缺少可读取的分 P 信息。", {
      retryable: true
    });
  }

  const player = await requestBilibiliJson({
    url: `${BILIBILI_API_ROOT}/x/player/v2?aid=${encodeURIComponent(aid)}&cid=${encodeURIComponent(cid)}`,
    headers,
    fetchImpl,
    timeoutMs
  });
  const subtitles = normalizeBilibiliSubtitles(player?.subtitle?.subtitles);
  const durationSeconds = finitePositiveNumber(page?.duration || view.duration);
  let audioStream = null;

  // BiliGPT's useful default is subtitle-first. Only ask for a media stream when
  // the platform has no usable subtitle track.
  if (!subtitles.length) {
    const playUrl = await requestBilibiliJson({
      url: `${BILIBILI_API_ROOT}/x/player/playurl?bvid=${encodeURIComponent(view.bvid || target.bvid || "")}`
        + `&cid=${encodeURIComponent(cid)}&fnval=16&qn=16&fourk=0`,
      headers,
      fetchImpl,
      timeoutMs
    });
    audioStream = selectLowestBandwidthAudio(playUrl?.dash?.audio);
  }

  if (!subtitles.length && !audioStream?.url) {
    throw providerError("video_media_url_missing", "这个 B 站视频没有可用字幕或音频流。", {
      retryable: false
    });
  }

  const canonicalUrl = view.bvid
    ? `https://www.bilibili.com/video/${view.bvid}/`
    : source.href;
  const estimatedMediaBytes = estimateBytes({
    bandwidth: audioStream?.bandwidth,
    durationSeconds
  });

  return {
    provider: "bilibili-api",
    platform: "bilibili",
    providerContentId: String(view.bvid || target.bvid || view.aid || target.aid || ""),
    title: cleanText(
      Array.isArray(view.pages) && view.pages.length > 1
        ? page?.part || view.title
        : view.title || page?.part || "哔哩哔哩视频"
    ),
    description: cleanText(view.desc || view.dynamic || ""),
    account: cleanText(view.owner?.name || ""),
    sourceUrl: canonicalUrl,
    mediaUrl: audioStream?.url || "",
    mediaUrls: audioStream?.urls || [],
    coverUrl: cleanText(view.pic || ""),
    durationSeconds,
    subtitles,
    mediaKind: subtitles.length ? "platform_subtitles" : "audio",
    mediaHeaders: {
      "user-agent": DEFAULT_USER_AGENT,
      referer: "https://www.bilibili.com/"
    },
    estimatedMediaBytes,
    acquisition: {
      mode: subtitles.length ? "platform_subtitles" : "audio_only",
      fullVideoDownloaded: false,
      estimatedMediaBytes
    }
  };
}

async function resolveBilibiliSourceUrl({
  source,
  headers,
  fetchImpl,
  timeoutMs
}) {
  const host = source.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "b23.tv") return source;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(source.href, {
      headers,
      signal: controller.signal,
      redirect: "follow"
    });
    if (!response.ok || !response.url) {
      throw providerError("provider_unavailable", "B 站短链接暂时无法解析。", {
        retryable: response.status >= 500,
        status: response.status
      });
    }
    const resolved = normalizeVideoSourceUrl(response.url);
    const resolvedHost = resolved.hostname.toLowerCase().replace(/^www\./, "");
    if (resolvedHost !== "bilibili.com" && !resolvedHost.endsWith(".bilibili.com")) {
      throw providerError("invalid_video_url", "B 站短链接没有指向可读取的视频。", {
        retryable: false
      });
    }
    return resolved;
  } catch (error) {
    if (error?.code === "failed_extract_video") throw error;
    if (error?.name === "AbortError") {
      throw providerError("provider_timeout", "B 站短链接解析超时，请稍后重试。", {
        retryable: true
      });
    }
    throw providerError("provider_unavailable", "B 站短链接暂时无法解析。", {
      retryable: true,
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseBilibiliTarget(url) {
  const bvid = url.pathname.match(/\/video\/(BV[\w]+)/i)?.[1] || "";
  const aid = url.pathname.match(/\/video\/av(\d+)/i)?.[1] || "";
  if (!bvid && !aid) {
    throw providerError(
      "invalid_video_url",
      "请使用包含 BV 号或 av 号的 B 站视频链接。",
      { retryable: false }
    );
  }
  return {
    bvid,
    aid,
    pageNumber: readPositiveInt(url.searchParams.get("p"), 1)
  };
}

function buildViewUrl(target) {
  const query = target.bvid
    ? `bvid=${encodeURIComponent(target.bvid)}`
    : `aid=${encodeURIComponent(target.aid)}`;
  return `${BILIBILI_API_ROOT}/x/web-interface/view?${query}`;
}

async function requestBilibiliJson({
  url,
  headers,
  fetchImpl,
  timeoutMs
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers,
      signal: controller.signal,
      redirect: "follow"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object") {
      throw providerError("provider_unavailable", "B 站内容接口暂时不可用。", {
        retryable: response.status >= 500,
        status: response.status
      });
    }
    if (payload.code !== 0 || !payload.data) {
      throw providerError(
        "provider_api_error",
        cleanText(payload.message) || "B 站没有返回可读取的视频内容。",
        {
          retryable: false,
          status: payload.code
        }
      );
    }
    return payload.data;
  } catch (error) {
    if (error?.code === "failed_extract_video") throw error;
    if (error?.name === "AbortError") {
      throw providerError("provider_timeout", "B 站内容接口响应超时，请稍后重试。", {
        retryable: true
      });
    }
    throw providerError("provider_unavailable", "B 站内容接口暂时不可用。", {
      retryable: true,
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildApiHeaders(sessionData) {
  const token = String(sessionData || "").split(",").map((item) => item.trim()).find(Boolean) || "";
  return {
    accept: "application/json",
    "user-agent": DEFAULT_USER_AGENT,
    referer: "https://www.bilibili.com/",
    ...(token ? { cookie: `SESSDATA=${token}` } : {})
  };
}

function selectPage(pages, pageNumber) {
  if (!Array.isArray(pages) || !pages.length) return null;
  return pages.find((page) => Number(page?.page) === Number(pageNumber)) || pages[0];
}

function normalizeBilibiliSubtitles(subtitles) {
  const tracks = Array.isArray(subtitles) ? subtitles : [];
  return normalizeSubtitleTracks(tracks.map((track) => ({
    language: cleanText(track?.lan),
    url: normalizeProtocolUrl(track?.subtitle_url),
    format: "bilibili-json",
    type: cleanText(track?.type)
  })));
}

function selectLowestBandwidthAudio(audioStreams) {
  const streams = Array.isArray(audioStreams) ? audioStreams : [];
  return streams
    .map((stream) => ({
      urls: uniqueUrls([
        ...(stream?.backupUrl || stream?.backup_url || []),
        stream?.baseUrl || stream?.base_url
      ]),
      bandwidth: finitePositiveNumber(stream?.bandwidth)
    }))
    .map((stream) => ({
      ...stream,
      url: stream.urls[0] || ""
    }))
    .filter((stream) => stream.url)
    .sort((left, right) => (
      (left.bandwidth || Number.MAX_SAFE_INTEGER)
      - (right.bandwidth || Number.MAX_SAFE_INTEGER)
    ))[0] || null;
}

function uniqueUrls(values) {
  return [...new Set(
    values
      .map(normalizeProtocolUrl)
      .filter(Boolean)
  )];
}

function normalizeProtocolUrl(value) {
  const url = cleanText(value);
  return url.startsWith("//") ? `https:${url}` : url;
}

function estimateBytes({ bandwidth, durationSeconds }) {
  if (!bandwidth || !durationSeconds) return null;
  return Math.ceil((Number(bandwidth) * Number(durationSeconds)) / 8);
}

function providerError(type, message, details = {}) {
  return createMediaExtractionError(type, message, {
    provider: "bilibili-api",
    ...details
  });
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function finitePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
