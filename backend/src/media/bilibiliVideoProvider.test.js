import assert from "node:assert/strict";
import test from "node:test";

import { fetchBilibiliVideoSource } from "./bilibiliVideoProvider.js";

test("uses Bilibili platform subtitles without requesting a media stream", async () => {
  const calls = [];
  const result = await fetchBilibiliVideoSource({
    sourceUrl: "https://www.bilibili.com/video/BV1subtitle/?p=2",
    sessionData: "session-value",
    fetchImpl: createBilibiliFetch({
      calls,
      view: {
        bvid: "BV1subtitle",
        aid: 12,
        title: "完整视频标题",
        desc: "视频简介",
        duration: 900,
        owner: { name: "作者" },
        pages: [
          { page: 1, cid: 101, part: "第一部分", duration: 400 },
          { page: 2, cid: 102, part: "第二部分", duration: 500 }
        ]
      },
      player: {
        subtitle: {
          subtitles: [{
            lan: "ai-zh",
            subtitle_url: "//subtitle.example.com/ai-zh.json",
            type: 1
          }]
        }
      }
    })
  });

  assert.equal(result.provider, "bilibili-api");
  assert.equal(result.providerContentId, "BV1subtitle");
  assert.equal(result.title, "第二部分");
  assert.equal(result.durationSeconds, 500);
  assert.equal(result.mediaKind, "platform_subtitles");
  assert.equal(result.mediaUrl, "");
  assert.equal(result.acquisition.fullVideoDownloaded, false);
  assert.deepEqual(result.subtitles, [{
    language: "ai-zh",
    url: "https://subtitle.example.com/ai-zh.json",
    format: "bilibili-json",
    type: "1"
  }]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /web-interface\/view/);
  assert.match(calls[1].url, /player\/v2/);
  assert.equal(calls[0].options.headers.cookie, "SESSDATA=session-value");
});

test("falls back to the lowest-bandwidth audio stream instead of a full video", async () => {
  const calls = [];
  const result = await fetchBilibiliVideoSource({
    sourceUrl: "https://www.bilibili.com/video/BV1audio/",
    fetchImpl: createBilibiliFetch({
      calls,
      view: {
        bvid: "BV1audio",
        aid: 13,
        cid: 201,
        title: "无字幕视频",
        duration: 600,
        owner: { name: "作者" },
        pages: [{ page: 1, cid: 201, part: "无字幕视频", duration: 600 }]
      },
      player: { subtitle: { subtitles: [] } },
      playUrl: {
        dash: {
          audio: [
            { bandwidth: 128000, baseUrl: "https://media.example.com/128.m4a" },
            {
              bandwidth: 64000,
              base_url: "https://media.example.com/64.m4a",
              backup_url: [
                "https://backup-1.example.com/64.m4a",
                "https://backup-2.example.com/64.m4a"
              ]
            }
          ],
          video: [
            { bandwidth: 400000, baseUrl: "https://media.example.com/video.mp4" }
          ]
        }
      }
    })
  });

  assert.equal(result.mediaKind, "audio");
  assert.equal(result.mediaUrl, "https://backup-1.example.com/64.m4a");
  assert.deepEqual(result.mediaUrls, [
    "https://backup-1.example.com/64.m4a",
    "https://backup-2.example.com/64.m4a",
    "https://media.example.com/64.m4a"
  ]);
  assert.equal(result.estimatedMediaBytes, 4_800_000);
  assert.equal(result.acquisition.mode, "audio_only");
  assert.equal(result.acquisition.fullVideoDownloaded, false);
  assert.equal(calls.length, 3);
  assert.match(calls[2].url, /player\/playurl/);
});

test("resolves a b23 short link before reading Bilibili metadata", async () => {
  const calls = [];
  const bilibiliFetch = createBilibiliFetch({
    calls,
    view: {
      bvid: "BV1short",
      aid: 14,
      cid: 301,
      title: "短链接视频",
      duration: 60,
      owner: { name: "作者" },
      pages: [{ page: 1, cid: 301, part: "短链接视频", duration: 60 }]
    },
    player: {
      subtitle: {
        subtitles: [{
          lan: "zh-CN",
          subtitle_url: "//subtitle.example.com/short.json"
        }]
      }
    }
  });
  const result = await fetchBilibiliVideoSource({
    sourceUrl: "https://b23.tv/example",
    fetchImpl: async (url, options = {}) => {
      if (String(url) === "https://b23.tv/example") {
        calls.push({ url: String(url), options });
        return {
          ok: true,
          status: 200,
          url: "https://www.bilibili.com/video/BV1short/"
        };
      }
      return bilibiliFetch(url, options);
    }
  });

  assert.equal(result.providerContentId, "BV1short");
  assert.equal(result.title, "短链接视频");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.redirect, "follow");
});

test("rejects Bilibili URLs without a BV or av identifier", async () => {
  await assert.rejects(
    () => fetchBilibiliVideoSource({
      sourceUrl: "https://www.bilibili.com/",
      fetchImpl: async () => {
        throw new Error("fetch should not run");
      }
    }),
    (error) => (
      error.mediaErrorType === "invalid_video_url"
      && error.provider === "bilibili-api"
      && error.retryable === false
    )
  );
});

function createBilibiliFetch({ calls, view, player, playUrl = null }) {
  return async (url, options = {}) => {
    const stringUrl = String(url);
    calls.push({ url: stringUrl, options });
    if (stringUrl.includes("/x/web-interface/view")) return jsonResponse({ code: 0, data: view });
    if (stringUrl.includes("/x/player/v2")) return jsonResponse({ code: 0, data: player });
    if (stringUrl.includes("/x/player/playurl")) return jsonResponse({ code: 0, data: playUrl });
    return jsonResponse({ code: -404, message: "not found" }, { status: 404 });
  };
}

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
