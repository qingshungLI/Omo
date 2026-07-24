import { analyzeScreenshotImage } from "./vision.js";
import { searchLinks } from "./search.js";
import { extractFocusedSourceContent, isVideoUrl } from "./source.js";
import { generateQuickReviewPath, generateVideoOverview } from "./review.js";

export async function runImageFlow({
  imagePath = "",
  imageBase64 = "",
  mimeType = "",
  ocrText = "",
  ocrLines = [],
  sourceUrl = "",
  publicMediaBaseUrl = "",
  includeDetails = false,
  onProgress = null,
  searcher = searchLinks,
  analyzeImage = analyzeScreenshotImage,
  extract = extractFocusedSourceContent,
  generate = generateQuickReviewPath,
  generateOverview = generateVideoOverview
} = {}) {
  const flowStartedAt = Date.now();
  reportProgress(onProgress, { stage: "vision", message: "正在理解 B站截图中的标题与 UP主", percent: 5 });
  const timings = {};
  if (!imagePath && !imageBase64 && !ocrText) throw flowError("screenshot_image_missing", "缺少截图内容。");
  const analysisStartedAt = Date.now();
  const captureAnalysis = ocrText
    ? buildProvidedTextAnalysis(ocrText, ocrLines)
    : await analyzeImage({ imagePath, imageBase64, mimeType });
  timings.visionMs = Date.now() - analysisStartedAt;
  const identity = captureAnalysis.identity || extractScreenshotIdentity(captureAnalysis.lines || captureAnalysis.text);
  const sourceIsBilibili = isBilibiliUrl(sourceUrl);
  if (sourceUrl && !sourceIsBilibili) {
    timings.totalMs = Date.now() - flowStartedAt;
    return {
      status: "platform_not_supported",
      message: "当前版本只接受 B站来源链接。",
      capture: serializeCaptureAnalysis(captureAnalysis, identity),
      timings
    };
  }
  if (!sourceIsBilibili && captureAnalysis.provider !== "provided-text" && identity.platform !== "bilibili") {
    timings.totalMs = Date.now() - flowStartedAt;
    return {
      status: "platform_not_supported",
      message: "当前版本先支持 B站截图，其他平台将在后续版本开放。",
      capture: serializeCaptureAnalysis(captureAnalysis, identity),
      timings
    };
  }
  reportProgress(onProgress, { stage: "search", message: "截图理解完成，正在用 TikHub 核对 B站来源", percent: 20 });
  const queries = buildSearchQueries(identity);
  const query = queries[0] || "";
  const searchStartedAt = Date.now();
  const resolvedSearch = sourceUrl
    ? { search: { provider: "input", query, results: [{ title: "用户指定链接", url: sourceUrl, snippet: "" }] }, candidate: { title: "用户指定链接", url: sourceUrl, snippet: "" } }
    : await searchScreenshotSource({ identity, queries, searcher });
  timings.searchMs = Date.now() - searchStartedAt;
  const search = resolvedSearch.search;
  const candidate = resolvedSearch.candidate;
  const result = {
    status: "vision_completed",
    capture: serializeCaptureAnalysis(captureAnalysis, identity),
    query,
    search,
    timings
  };
  if (includeDetails) {
    result.details = {
      capture: {
        text: captureAnalysis.text || "",
        lines: Array.isArray(captureAnalysis.lines) ? captureAnalysis.lines : []
      },
      searchQueries: queries
    };
  }
  if (!candidate) {
    timings.totalMs = Date.now() - flowStartedAt;
    return {
      ...result,
      status: search.errorCode || "search_match_low_confidence",
      message: search.errorCode
        ? "已理解截图，但尚未配置可用的 B站搜索 API。"
        : "没有找到标题和博主均可信的来源链接，已停止生成，避免保存错误内容。"
    };
  }

  result.link = candidate;
  reportProgress(onProgress, { stage: "extract", message: "已找到来源，正在并发转写代表片段；少量片段成功后立即继续", percent: 40 });
  const sourceType = isVideoUrl(candidate.url) ? "video_link" : "article_link";
  try {
    const extractionStartedAt = Date.now();
    const source = await extract({
      sourceType,
      sourceUrl: candidate.url,
      sourceTitle: candidate.title,
      rawText: candidate.snippet,
      timestampSeconds: identity.timestampSeconds,
      locatorTerms: identity.locatorTerms,
      publicMediaBaseUrl
    });
    timings.sourceExtractionMs = Date.now() - extractionStartedAt;
    result.source = {
      sourceType,
      title: source.sourceTitle,
      url: source.sourceUrl,
      account: source.sourceAccount,
      textLength: String(source.rawText || "").length,
      platform: source.platform,
      focus: source.focus || null
    };
    if (includeDetails) {
      result.details.source = {
        rawText: source.rawText || "",
        overviewText: source.overviewText || "",
        blocks: Array.isArray(source.blocks) ? source.blocks : [],
        overviewBlocks: Array.isArray(source.overviewBlocks) ? source.overviewBlocks : [],
        transcriptSegments: Array.isArray(source.learningSource?.transcriptSegments)
          ? source.learningSource.transcriptSegments
          : [],
        extractionMeta: source.learningSource?.extractionMeta || null
      };
    }
    const reviewInput = {
      id: `image-${Date.now()}`,
      title: source.sourceTitle,
      sourceUrl: source.sourceUrl,
      sourceAccount: source.sourceAccount,
      rawText: source.rawText,
      blocks: source.blocks
    };
    reportProgress(onProgress, { stage: "generate", message: "内容已提取，正在生成截图知识卡和全片总结", percent: 82 });
    const reviewRequest = measureAsync(timings, "reviewGenerationMs", () => generate(reviewInput));
    const overviewRequest = sourceType === "video_link"
      ? measureAsync(timings, "overviewGenerationMs", () => generateOverview({ title: source.sourceTitle, account: source.sourceAccount, rawText: source.overviewText }))
      : null;
    const generationStartedAt = Date.now();
    const [review, videoOverview] = await Promise.all([reviewRequest, overviewRequest]);
    timings.generationWallMs = Date.now() - generationStartedAt;
    result.review = review;
    if (videoOverview) result.videoOverview = videoOverview;
    result.status = "completed";
    reportProgress(onProgress, { stage: "completed", message: "复习卡已生成", percent: 100 });
  } catch (error) {
    if (timings.sourceExtractionMs === undefined) {
      timings.sourceExtractionMs = Date.now() - (
        flowStartedAt
        + timings.visionMs
        + timings.searchMs
      );
    }
    result.error = { code: error?.code || "source_extract_failed", message: error?.message || "来源内容提取失败。", provider: error?.provider || null };
    result.status = result.error.code;
    reportProgress(onProgress, { stage: "failed", message: result.error.message, percent: 100 });
  }
  timings.totalMs = Date.now() - flowStartedAt;
  return result;
}

function reportProgress(handler, progress) {
  try { handler?.(progress); } catch { /* progress reporting must not break the flow */ }
}

function buildProvidedTextAnalysis(ocrText, ocrLines) {
  const lines = Array.isArray(ocrLines) && ocrLines.length > 0
    ? ocrLines
    : String(ocrText || "").split(/\r?\n/);
  return {
    provider: "provided-text",
    model: null,
    text: String(ocrText || "").trim(),
    lines,
    identity: extractScreenshotIdentity(lines),
    latencyMs: 0
  };
}

function serializeCaptureAnalysis(analysis, identity) {
  return {
    provider: analysis.provider,
    model: analysis.model || null,
    latencyMs: analysis.latencyMs || null,
    identity
  };
}

async function measureAsync(timings, key, operation) {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    timings[key] = Date.now() - startedAt;
  }
}

export function buildSearchQuery(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return [input.title, input.account].filter(Boolean).join(" ").slice(0, 160);
  }
  return buildSearchQuery(extractScreenshotIdentity(input));
}

export function buildSearchQueries(identity) {
  const title = normalizeSearchTitle(identity?.title);
  const account = String(identity?.account || "").trim();
  const rawTitle = title.replace(/【[^】]*】/g, "").trim();
  const titleSegments = rawTitle.split(/[：:，,。！？!?]+/).map((item) => item.trim()).filter(Boolean);
  const plainTitle = titleSegments.join(" ");
  const anchorTitle = titleSegments[0]?.length >= 6
    ? titleSegments.slice(0, 2).join(" ")
    : titleSegments[0] || plainTitle;
  // One concise account + title-anchor query is faster and proved more stable
  // than firing several long variants at TikHub. Candidate ranking still uses
  // the complete OCR title and account below.
  return [[account, anchorTitle].filter(Boolean).join(" ") || title || plainTitle].filter(Boolean);
}

async function searchScreenshotSource({ identity, queries, searcher }) {
  const [primaryQuery] = queries;
  const primarySearch = await searcher(primaryQuery);
  const primaryCandidate = pickCandidate(primarySearch.results, identity);
  const attempts = [{ query: primaryQuery, resultCount: Array.isArray(primarySearch.results) ? primarySearch.results.length : 0, matched: Boolean(primaryCandidate) }];
  return { search: { ...primarySearch, query: primaryQuery, attempts }, candidate: primaryCandidate };
}

function normalizeSearchTitle(value) {
  return String(value || "").replace(/[.。…]+$/g, "").trim();
}

export function extractScreenshotIdentity(input) {
  const lines = Array.isArray(input) ? input : String(input || "").split(/\r?\n/);
  const cleaned = lines.map((line) => String(line || "").replace(/\s+/g, " ").trim());
  const usable = cleaned.filter((line) => isContentLine(line));
  const title = [...usable]
    .map((line, index) => ({ line, index, score: titleScore(line) }))
    .sort((a, b) => b.score - a.score || b.line.length - a.line.length)[0];
  const titleIndex = title ? cleaned.indexOf(title.line) : -1;
  const account = findAccount(cleaned, titleIndex);
  return {
    title: title?.line || "",
    account,
    timestampSeconds: findPlayerTimestamp(cleaned),
    platform: inferPlatform(cleaned),
    locatorTerms: usable.filter((line) => line !== title?.line && line !== account).slice(0, 8),
    confidence: title?.line ? Math.min(1, title.score / 20) : 0
  };
}

function isContentLine(line) {
  return line.length >= 2
    && /[\u4e00-\u9fffA-Za-z]{2,}/.test(line)
    && !isUiChrome(line)
    && !/^(\d{1,2}:\d{2}|\d+[万亿]?[播放粉丝赞]|\d+视频)$/.test(line);
}

function isUiChrome(line) {
  return /(简介|评论|充电|已关注|关注|分享|收藏|不喜欢|正在看|播放|弹幕|分钟|点赞|立即打开|点我发弹幕|粉丝|\d+视频)/.test(line);
}

function titleScore(line) {
  let score = Math.min(12, line.length / 2);
  if (/【[^】]+】/.test(line)) score += 12;
  if (/[：:]/.test(line)) score += 3;
  if (/Top\s*\d+|年度|盘点|全球|策略|财经|股市|投资|教程|分析/i.test(line)) score += 4;
  if (line.length > 64) score -= 6;
  return score;
}

function findAccount(lines, titleIndex) {
  const nearby = lines.slice(Math.max(0, titleIndex - 10), Math.max(0, titleIndex));
  return nearby.reverse().find((line) => isContentLine(line)
    && line.length <= 18
    && !/[：:【】]/.test(line)
    && !isUiChrome(line)
    && !/\d+(?:\.\d+)?\s*(?:万|亿)?(?:粉丝|播放|视频|点赞|评论)/.test(line)
    && !/财经跨年|年度盘点|中国财经年/.test(line)) || "";
}

function findPlayerTimestamp(lines) {
  for (const line of lines) {
    const match = line.match(/(?:进度|播放)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*\/\s*\d{1,2}:\d{2}/);
    if (!match) continue;
    const [, first, second, third] = match;
    return third ? Number(first) * 3600 + Number(second) * 60 + Number(third) : Number(first) * 60 + Number(second);
  }
  return null;
}

function inferPlatform(lines) {
  const text = lines.join(" ");
  if (/bilibili|哔哩|B站/i.test(text)) return "bilibili";
  if (/小红书|xhs/i.test(text)) return "xiaohongshu";
  if (/抖音|douyin/i.test(text)) return "douyin";
  if (/youtube/i.test(text)) return "youtube";
  return "";
}

function isBilibiliUrl(value) {
  try {
    const hostname = new URL(String(value || "")).hostname.toLowerCase();
    return hostname === "b23.tv"
      || hostname.endsWith(".b23.tv")
      || hostname === "bilibili.com"
      || hostname.endsWith(".bilibili.com");
  } catch {
    return false;
  }
}

export function pickCandidate(results, identity) {
  const items = (Array.isArray(results) ? results : [])
    .filter((item) => candidateMatchesPlatform(item, identity))
    .filter((item) => candidateMatchesAccount(item, identity));
  const ranked = items.map((item) => ({ ...item, matchScore: scoreCandidate(item, identity) }))
    .sort((a, b) => b.matchScore - a.matchScore);
  const best = ranked[0];
  return best && best.matchScore >= 0.68 ? best : null;
}

function candidateMatchesPlatform(item, identity) {
  if (identity?.platform !== "bilibili") return true;
  return isBilibiliUrl(item?.url);
}

function candidateMatchesAccount(item, identity) {
  const account = String(identity?.account || "").trim();
  if (!account) return true;
  const candidateText = [item?.account, item?.snippet].filter(Boolean).join(" ");
  return textSimilarity(candidateText, account) >= 0.45;
}

function scoreCandidate(item, identity) {
  const titleScore = textSimilarity(item?.title, identity?.title);
  const accountScore = identity?.account
    ? textSimilarity([item?.account, item?.snippet].filter(Boolean).join(" "), identity.account)
    : 0;
  const platformScore = identity?.platform && String(item?.url || "").toLowerCase().includes(identity.platform) ? 1 : 0;
  return titleScore * 0.82 + accountScore * 0.13 + platformScore * 0.05;
}

function textSimilarity(left, right) {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const gramsA = ngrams(a);
  const gramsB = ngrams(b);
  const common = [...gramsA].filter((item) => gramsB.has(item)).length;
  return (2 * common) / (gramsA.size + gramsB.size || 1);
}

function normalizedText(value) {
  return String(value || "").toLowerCase().replace(/[^\u4e00-\u9fff0-9a-z]/g, "");
}

function ngrams(value) {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
}

function flowError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
