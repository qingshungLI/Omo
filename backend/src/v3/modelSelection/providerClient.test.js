import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  callModelCandidate,
  ModelSelectionError
} from "./providerClient.js";
import { validCaptureOutput } from "./testFixtures.js";

const candidate = {
  id: "test-qwen",
  provider: "qwen",
  model: "test-model",
  mode: "text",
  endpoint: "https://example.test/chat/completions",
  apiKeyEnv: ["TEST_MODEL_KEY"],
  supportsImages: false
};

test("provider client uses explicit candidate and normalizes usage", async () => {
  let requestBody;
  const result = await callModelCandidate({
    candidate,
    system: "system",
    user: "user",
    schemaName: "capture_analysis",
    schema: { type: "object" },
    env: { TEST_MODEL_KEY: "secret" },
    fetchImpl: async (_url, request) => {
      requestBody = JSON.parse(request.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validCaptureOutput()) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(requestBody.model, "test-model");
  assert.equal(result.data.schemaVersion, "capture_analysis_v1");
  assert.deepEqual(result.usage, {
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 50
  });
});

test("parse failure retains raw text only as a non-enumerable in-memory field", async () => {
  await assert.rejects(
    callModelCandidate({
      candidate,
      system: "system",
      user: "user",
      schemaName: "capture_analysis",
      schema: { type: "object" },
      env: { TEST_MODEL_KEY: "secret" },
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: "private invalid response" } }]
      }), { status: 200, headers: { "content-type": "application/json" } })
    }),
    (error) => {
      assert.equal(error instanceof ModelSelectionError, true);
      assert.equal(error.code, "model_json_parse_failed");
      assert.equal(error.rawText, "private invalid response");
      assert.equal(JSON.stringify(error).includes("private invalid response"), false);
      return true;
    }
  );
});

test("text candidate refuses image input", async () => {
  await assert.rejects(
    callModelCandidate({
      candidate,
      system: "system",
      user: "user",
      schemaName: "capture_analysis",
      schema: { type: "object" },
      image: {
        path: "/tmp/example.png",
        mimeType: "image/png",
        consentToCloudAnalysis: true
      },
      env: { TEST_MODEL_KEY: "secret" }
    }),
    (error) => error.code === "image_not_allowed_for_candidate"
  );
});

test("vision candidate sends a consented local image", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recallo-vision-"));
  const imagePath = join(directory, "fixture.png");
  await writeFile(imagePath, Buffer.from("fixture"));
  try {
    let requestBody;
    await callModelCandidate({
      candidate: { ...candidate, id: "vision", mode: "vision", supportsImages: true },
      system: "system",
      user: "user",
      schemaName: "capture_analysis",
      schema: { type: "object" },
      image: {
        path: imagePath,
        mimeType: "image/png",
        consentToCloudAnalysis: true
      },
      env: { TEST_MODEL_KEY: "secret" },
      fetchImpl: async (_url, request) => {
        requestBody = JSON.parse(request.body);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(validCaptureOutput()) } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    const imagePart = requestBody.messages[1].content.find((part) => part.type === "image_url");
    assert.match(imagePart.image_url.url, /^data:image\/png;base64,/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
