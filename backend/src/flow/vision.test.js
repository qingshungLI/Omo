import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeScreenshotImage,
  normalizeScreenshotIdentity
} from "./vision.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("sends the screenshot directly to the configured vision model", async () => {
  let request = null;
  const result = await analyzeScreenshotImage({
    imageBase64: ONE_PIXEL_PNG,
    mimeType: "image/png",
    modelJsonCaller: async (input) => {
      request = input;
      return {
        platform: "bilibili",
        title: "如何建立长期记忆",
        account: "学习博主",
        timestampSeconds: 42,
        locatorTerms: ["主动回忆", "间隔重复"],
        visibleTextLines: ["学习博主", "如何建立长期记忆", "00:42 / 12:30"],
        confidence: 0.94
      };
    }
  });

  assert.equal(request.stage, "screenshot_identity");
  assert.equal(request.provider, "qwen");
  assert.equal(request.model, "qwen3.7-plus-2026-05-26");
  assert.match(request.imageDataUrl, /^data:image\/png;base64,/);
  assert.equal(result.provider, "qwen-vision");
  assert.equal(result.identity.platform, "bilibili");
  assert.equal(result.identity.timestampSeconds, 42);
});

test("normalizes uncertain platforms without inventing source details", () => {
  const identity = normalizeScreenshotIdentity({
    platform: "douyin",
    title: "可见标题",
    account: "",
    timestampSeconds: "invalid",
    locatorTerms: [],
    visibleTextLines: ["可见标题"],
    confidence: 2
  });
  assert.equal(identity.platform, "unknown");
  assert.equal(identity.timestampSeconds, null);
  assert.equal(identity.confidence, 1);
});

test("allows an unknown platform without inventing a title", () => {
  const identity = normalizeScreenshotIdentity({
    platform: "unknown",
    title: "",
    account: "",
    timestampSeconds: null,
    locatorTerms: [],
    visibleTextLines: [],
    confidence: 0
  });
  assert.equal(identity.platform, "unknown");
  assert.equal(identity.title, "");
});

test("rejects unsupported or oversized screenshot payloads", async () => {
  await assert.rejects(
    analyzeScreenshotImage({
      imageBase64: "not-base64",
      mimeType: "image/gif",
      modelJsonCaller: async () => ({})
    }),
    (error) => error.code === "screenshot_image_invalid"
  );

  await assert.rejects(
    analyzeScreenshotImage({
      imageBase64: Buffer.alloc(32).toString("base64"),
      mimeType: "image/png",
      maxImageBytes: 16,
      modelJsonCaller: async () => ({})
    }),
    (error) => error.code === "screenshot_image_too_large"
  );
});
