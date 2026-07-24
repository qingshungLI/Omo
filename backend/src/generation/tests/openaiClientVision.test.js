import assert from "node:assert/strict";
import test from "node:test";

import { buildCompatibleUserContent } from "../openaiClient.js";

test("keeps text-only model requests as plain text", () => {
  assert.equal(buildCompatibleUserContent("hello"), "hello");
});

test("builds a Qwen-compatible image request without logging image bytes as text", () => {
  const content = buildCompatibleUserContent(
    "read this screenshot",
    "data:image/png;base64,aGVsbG8="
  );
  assert.deepEqual(content, [
    { type: "text", text: "read this screenshot" },
    {
      type: "image_url",
      image_url: { url: "data:image/png;base64,aGVsbG8=" }
    }
  ]);
});

test("rejects unsupported image data URLs", () => {
  assert.throws(
    () => buildCompatibleUserContent("read", "https://example.com/image.png"),
    /Base64 Data URL/
  );
});
