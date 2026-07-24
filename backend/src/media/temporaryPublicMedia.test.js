import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizePublicBaseUrl,
  registerTemporaryPublicMedia,
  takeTemporaryPublicMedia
} from "./temporaryPublicMedia.js";

test("creates a short-lived HTTPS capability URL for Qwen ASR", () => {
  const lease = registerTemporaryPublicMedia({
    path: "/tmp/audio.m4a",
    contentType: "audio/mp4",
    publicBaseUrl: "https://api.example.com/",
    now: 100
  });
  assert.match(lease.url, /^https:\/\/api\.example\.com\/api\/asr-media\/[0-9a-f-]{36}$/);
  const token = lease.url.split("/").at(-1);
  assert.equal(takeTemporaryPublicMedia(token, { now: 101 }).path, "/tmp/audio.m4a");
  lease.release();
  assert.equal(takeTemporaryPublicMedia(token, { now: 102 }), null);
});

test("does not publish temporary media through HTTP or localhost", () => {
  assert.equal(normalizePublicBaseUrl("http://api.example.com"), "");
  assert.equal(normalizePublicBaseUrl("https://localhost:5173"), "");
  assert.equal(registerTemporaryPublicMedia({ path: "/tmp/audio", publicBaseUrl: "http://api.example.com" }), null);
});
