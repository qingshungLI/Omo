import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchQueries, buildSearchQuery, extractScreenshotIdentity, runImageFlow } from "./index.js";
import { focusSourceContent } from "./source.js";
import { searchLinks } from "./search.js";

test("builds a compact query from account and title OCR lines", () => {
  const query = buildSearchQuery([
    "18:35",
    "巫师财经",
    "简介",
    "【巫师】财经跨年：中国财经年度盘点Top10",
    "评论1815"
  ]);
  assert.match(query, /巫师财经/);
  assert.match(query, /中国财经年度盘点Top10/);
  assert.doesNotMatch(query, /18:35/);
});

test("uses one concise high-signal query and keeps strict candidate matching", async () => {
  const queries = [];
  const result = await runImageFlow({
    ocrText: "巫师财经\n【巫师】财经跨年：中国财经年度盘点Top10",
    searcher: async (query) => {
      queries.push(query);
      return { provider: "tikhub", query, results: [{ title: "【巫师】财经跨年：中国财经年度盘点Top10", url: "https://www.bilibili.com/video/BVright", account: "巫师财经" }] };
    },
    extract: async () => ({ sourceTitle: "目标视频", sourceUrl: "https://www.bilibili.com/video/BVright", sourceAccount: "巫师财经", platform: "bilibili", rawText: "当前片段", overviewText: "全片内容", blocks: [{ id: "p-1", text: "当前片段" }], focus: {} }),
    generate: async () => ({ summaryCard: { text: "核心内容" }, units: [] }),
    generateOverview: async () => ({ summary: "全片概览", highlights: ["要点一"] })
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(queries, ["巫师财经 财经跨年"]);
  assert.ok(result.search.attempts.some((attempt) => attempt.matched));
});

test("builds bounded title search variants for a platform screenshot", () => {
  assert.deepEqual(buildSearchQueries({ title: "【巫师】财经跨年：中国财经年度盘点Top10", account: "巫师财经" }), [
    "巫师财经 财经跨年"
  ]);
});

test("returns visual/search result without a search provider", async () => {
  const result = await runImageFlow({
    imagePath: "/tmp/test.jpg",
    analyzeImage: async () => ({
      provider: "test-vision",
      identity: {
        platform: "bilibili",
        title: "中国财经年度盘点Top10",
        account: "巫师财经",
        timestampSeconds: null,
        locatorTerms: [],
        confidence: 0.9
      },
      lines: ["巫师财经", "中国财经年度盘点Top10"]
    }),
    searcher: async (query) => ({ provider: "none", query, results: [], errorCode: "search_provider_missing" })
  });
  assert.equal(result.status, "search_provider_missing");
  assert.match(result.query, /巫师财经/);
});

test("keeps only title, account, and explicit player timestamp from screenshot OCR", () => {
  const identity = extractScreenshotIdentity([
    "18:35",
    "巫师财经",
    "简介",
    "【巫师】财经跨年：中国财经年度盘点Top10",
    "00:42 / 25:29",
    "评论 1815"
  ]);
  assert.equal(identity.title, "【巫师】财经跨年：中国财经年度盘点Top10");
  assert.equal(identity.account, "巫师财经");
  assert.equal(identity.timestampSeconds, 42);
});

test("ignores OCR-mangled follow controls when finding a Bilibili account", () => {
  const identity = extractScreenshotIdentity([
    "简介",
    "评论1815",
    "巫师财经",
    "充电",
    "三已关注",
    "430.6万粉丝",
    "121视频",
    "【巫师】财经跨年：中国财经年度盘点Top10"
  ]);
  assert.equal(identity.account, "巫师财经");
  assert.equal(identity.title, "【巫师】财经跨年：中国财经年度盘点Top10");
});

test("keeps the account above a truncated screenshot title", () => {
  const identity = extractScreenshotIdentity([
    "巫师财经",
    "三已关注",
    "430.6万粉丝",
    "121视频",
    "【巫师】全球股市年度排名，谁是神，谁.."
  ]);
  assert.equal(identity.account, "巫师财经");
  assert.equal(identity.title, "【巫师】全球股市年度排名，谁是神，谁..");
});

test("rejects a search result whose title does not match the screenshot", async () => {
  const result = await runImageFlow({
    ocrText: "巫师财经\n【巫师】财经跨年：中国财经年度盘点Top10",
    searcher: async (query) => ({
      provider: "tikhub",
      query,
      results: [{ title: "老挝举全国之力要逆天改命", url: "https://www.bilibili.com/video/BVwrong" }]
    })
  });
  assert.equal(result.status, "search_match_low_confidence");
  assert.equal(result.link, undefined);
  assert.equal(result.review, undefined);
});

test("rejects the same Bilibili title when the UP account does not match", async () => {
  const result = await runImageFlow({
    ocrText: "巫师财经\n【巫师】财经跨年：中国财经年度盘点Top10",
    searcher: async (query) => ({
      provider: "tikhub",
      query,
      results: [{
        title: "【巫师】财经跨年：中国财经年度盘点Top10",
        url: "https://www.bilibili.com/video/BVwrong",
        account: "另一个账号",
        snippet: "无关账号"
      }]
    })
  });
  assert.equal(result.status, "search_match_low_confidence");
  assert.equal(result.link, undefined);
});

test("returns a timestamp-focused review and a whole-video overview", async () => {
  const result = await runImageFlow({
    includeDetails: true,
    ocrText: "巫师财经\n【巫师】财经跨年：中国财经年度盘点Top10\n00:42 / 25:29",
    searcher: async (query) => ({
      provider: "tikhub",
      query,
      results: [{ title: "【巫师】财经跨年：中国财经年度盘点Top10", url: "https://www.bilibili.com/video/BVright", account: "巫师财经" }]
    }),
    extract: async () => ({
      sourceTitle: "【巫师】财经跨年：中国财经年度盘点Top10",
      sourceUrl: "https://www.bilibili.com/video/BVright",
      sourceAccount: "巫师财经",
      platform: "bilibili",
      rawText: "42 秒附近的核心观点。",
      overviewText: "完整视频转写，包含市场、行业和公司三个部分。",
      overviewBlocks: [{ id: "transcript-all", text: "完整视频转写", startSeconds: 0, endSeconds: 100 }],
      blocks: [{ id: "transcript-1", text: "42 秒附近的核心观点。", startSeconds: 40, endSeconds: 50 }],
      learningSource: {
        transcriptSegments: [{ id: "segment-1", text: "核心观点", startSeconds: 40, endSeconds: 50 }],
        extractionMeta: { fastPath: "platform_subtitle" }
      },
      focus: { status: "timestamp_window", timestampSeconds: 42 }
    }),
    generate: async () => ({ summaryCard: { text: "核心内容总结" }, units: [] }),
    generateOverview: async () => ({ summary: "全片概览", highlights: ["市场", "行业"] })
  });
  assert.equal(result.status, "completed");
  assert.equal(result.review.summaryCard.text, "核心内容总结");
  assert.equal(result.videoOverview.summary, "全片概览");
  assert.equal(result.details.capture.text.includes("财经跨年"), true);
  assert.equal(result.details.source.overviewText.includes("完整视频转写"), true);
  assert.equal(result.details.source.transcriptSegments.length, 1);
  assert.equal(result.details.source.extractionMeta.fastPath, "platform_subtitle");
  assert.equal(Number.isFinite(result.timings.visionMs), true);
  assert.equal(Number.isFinite(result.timings.searchMs), true);
  assert.equal(Number.isFinite(result.timings.sourceExtractionMs), true);
  assert.equal(Number.isFinite(result.timings.reviewGenerationMs), true);
  assert.equal(Number.isFinite(result.timings.overviewGenerationMs), true);
  assert.equal(Number.isFinite(result.timings.totalMs), true);
});

test("selects only subtitle blocks around the player timestamp", () => {
  const focus = focusSourceContent({
    rawText: "全片转写",
    blocks: [
      { id: "a", text: "开场", startSeconds: 0, endSeconds: 10 },
      { id: "b", text: "核心观点", startSeconds: 90, endSeconds: 110 },
      { id: "c", text: "结尾", startSeconds: 250, endSeconds: 260 }
    ]
  }, 100, { radiusSeconds: 20 });
  assert.equal(focus.status, "timestamp_window");
  assert.deepEqual(focus.blocks.map((block) => block.id), ["b"]);
});

test("locates a missing player timestamp from OCR keywords in timed transcript", () => {
  const focus = focusSourceContent({
    rawText: "全片转写",
    blocks: [
      { id: "a", text: "开场介绍", startSeconds: 0, endSeconds: 10 },
      { id: "b", text: "垂死病中惊坐起，市场出现剧烈变化", startSeconds: 90, endSeconds: 110 },
      { id: "c", text: "结尾总结", startSeconds: 250, endSeconds: 260 }
    ]
  }, null, { locatorTerms: ["垂死病中惊坐起"] });
  assert.equal(focus.status, "transcript_match");
  assert.equal(focus.timestampSeconds, 90);
  assert.deepEqual(focus.blocks.map((block) => block.id), ["b"]);
});

test("uses TikHub Bilibili search when its key is configured", async () => {
  let requestedUrl = "";
  const result = await searchLinks("巫师财经 中国财经年度盘点 B站", {
    tikhubApiKey: "test-key",
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.equal(options.headers.authorization, "Bearer test-key");
      return {
        ok: true,
        json: async () => ({
          data: {
            result: [{
              title: "<em class=\"keyword\">巫师财经</em>年度盘点",
              bvid: "BV1example",
              description: "财经年度内容"
            }]
          }
        })
      };
    }
  });
  assert.equal(result.provider, "tikhub");
  assert.deepEqual(result.platforms, ["bilibili"]);
  assert.match(requestedUrl, /bilibili\/web\/fetch_general_search/);
  assert.equal(result.results[0].title, "巫师财经 年度盘点");
  assert.equal(result.results[0].url, "https://www.bilibili.com/video/BV1example");
});

test("hydrates a title-less TikHub Bilibili result before strict matching", async () => {
  let calls = 0;
  const result = await searchLinks("巫师财经 全球股市年度排名", {
    tikhubApiKey: "test-key",
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes("fetch_general_search")) {
        return { ok: true, json: async () => ({ data: { result: [{ bvid: "BV1exact", author: "巫师财经" }] } }) };
      }
      assert.match(String(url), /x\/web-interface\/view\?bvid=BV1exact/);
      return { ok: true, json: async () => ({ data: { title: "【巫师】全球股市年度排名，谁是神", desc: "年度复盘", owner: { name: "巫师财经" } } }) };
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.results[0].title, "【巫师】全球股市年度排名，谁是神");
  assert.equal(result.results[0].account, "巫师财经");
});

test("normalizes TikHub Douyin video search results", async () => {
  const result = await searchLinks("抖音 AI 学习", {
    tikhubApiKey: "test-key",
    enabledPlatforms: ["douyin"],
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "POST");
      return {
        ok: true,
        json: async () => ({
          data: {
            data: [{ aweme_info: { aweme_id: "123456", desc: "AI 学习方法", author: { nickname: "测试博主" } } }]
          }
        })
      };
    }
  });
  assert.equal(result.provider, "tikhub");
  assert.equal(result.results[0].url, "https://www.douyin.com/video/123456");
  assert.equal(result.results[0].title, "AI 学习方法");
});

test("keeps non-Bilibili TikHub adapters disabled by default", async () => {
  let called = false;
  const result = await searchLinks("抖音 AI 学习", {
    tikhubApiKey: "test-key",
    enabledPlatforms: ["bilibili"],
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({}) };
    }
  });
  assert.equal(called, false);
  assert.equal(result.errorCode, "platform_not_enabled");
  assert.deepEqual(result.platforms, []);
});

test("uses direct visual identity and rejects unsupported platforms before search", async () => {
  let searched = false;
  const result = await runImageFlow({
    imageBase64: "aGVsbG8=",
    mimeType: "image/png",
    analyzeImage: async () => ({
      provider: "qwen-vision",
      model: "qwen3.7-plus-2026-05-26",
      identity: {
        platform: "unknown",
        title: "其他平台标题",
        account: "其他作者",
        timestampSeconds: null,
        locatorTerms: [],
        confidence: 0.8
      },
      lines: ["其他平台标题"]
    }),
    searcher: async () => {
      searched = true;
      return { provider: "tikhub", results: [] };
    }
  });
  assert.equal(searched, false);
  assert.equal(result.status, "platform_not_supported");
  assert.equal(result.capture.provider, "qwen-vision");
});
