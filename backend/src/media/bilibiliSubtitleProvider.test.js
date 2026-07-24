import assert from "node:assert/strict";
import test from "node:test";

import { fetchBilibiliVideoSource } from "./bilibiliSubtitleProvider.js";

test("uses TikHub DASH audio when a Bilibili video has no subtitles", async () => {
  const requested = [];
  const result = await fetchBilibiliVideoSource({
    sourceUrl: "https://www.bilibili.com/video/BV1example",
    tikhubApiKey: "test-key",
    tikhubBaseUrl: "https://api.tikhub.example",
    fetchImpl: async (url, options) => {
      requested.push({ url: String(url), options });
      if (String(url).includes("/x/web-interface/view")) {
        return jsonResponse({ code: 0, data: { aid: 123, bvid: "BV1example", cid: 456, title: "无字幕视频", owner: { name: "测试博主" }, duration: 60 } });
      }
      if (String(url).includes("/x/player/v2")) return jsonResponse({ code: 0, data: { subtitle: { subtitles: [] } } });
      return jsonResponse({ code: 200, data: { code: 0, data: { dash: { audio: [
        { base_url: "https://media.example.com/low.m4s", bandwidth: 64_000 },
        { base_url: "https://media.example.com/high.m4s", bandwidth: 128_000 }
      ] } } } });
    }
  });

  assert.equal(result.audioUrl, "https://media.example.com/high.m4s");
  assert.equal(result.mediaUrl, "https://media.example.com/high.m4s");
  assert.deepEqual(result.mediaAlternativeUrls, ["https://media.example.com/low.m4s"]);
  assert.equal(result.mediaDownload, null);
  assert.match(requested.at(-1).url, /fetch_video_playurl\?bv_id=BV1example&cid=456/);
  assert.equal(requested.at(-1).options.headers.authorization, "Bearer test-key");
});

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}
