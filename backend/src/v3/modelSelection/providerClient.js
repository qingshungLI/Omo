import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseModelJson } from "../../generation/openaiClient.js";
import { resolveCandidateApiKey } from "./candidates.js";

export class ModelSelectionError extends Error {
  constructor(message, {
    code = "model_request_failed",
    provider = null,
    model = null,
    status = null,
    retryable = false,
    rawText = null
  } = {}) {
    super(message);
    this.name = "ModelSelectionError";
    this.code = code;
    this.provider = provider;
    this.model = model;
    this.status = status;
    this.retryable = retryable;
    this.rawHash = rawText ? sha256(rawText) : null;
    if (rawText !== null) {
      Object.defineProperty(this, "rawText", {
        value: String(rawText),
        enumerable: false,
        configurable: false,
        writable: false
      });
    }
  }
}

export async function callModelCandidate({
  candidate,
  system,
  user,
  schemaName,
  schema,
  image = null,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = candidate.timeoutMs || 30_000
}) {
  assertExplicitCandidate(candidate);
  if (image && !["vision", "ocr"].includes(candidate.mode)) {
    throw new ModelSelectionError("文本候选不能接收图片。", {
      code: "image_not_allowed_for_candidate",
      provider: candidate.provider,
      model: candidate.model
    });
  }
  if (["vision", "ocr"].includes(candidate.mode) && !image) {
    throw new ModelSelectionError("视觉候选必须接收图片。", {
      code: "image_required_for_candidate",
      provider: candidate.provider,
      model: candidate.model
    });
  }
  if (image && image.consentToCloudAnalysis !== true) {
    throw new ModelSelectionError("发送图片前必须取得明确云端分析同意。", {
      code: "image_consent_required",
      provider: candidate.provider,
      model: candidate.model
    });
  }

  const { value: apiKey } = resolveCandidateApiKey(candidate, env);
  if (!apiKey) {
    throw new ModelSelectionError(`缺少 ${candidate.apiKeyEnv.join(" 或 ")}。`, {
      code: "api_key_missing",
      provider: candidate.provider,
      model: candidate.model
    });
  }

  const startedAt = performance.now();
  const payload = candidate.provider === "openai"
    ? await buildOpenAIRequest({ candidate, system, user, schemaName, schema, image })
    : await buildCompatibleRequest({ candidate, system, user, schemaName, schema, image });

  let response;
  try {
    response = await fetchWithTimeout(fetchImpl, candidate.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }, timeoutMs);
  } catch (error) {
    if (error instanceof ModelSelectionError) throw error;
    throw new ModelSelectionError(error?.message || "模型请求失败。", {
      code: error?.name === "AbortError" ? "model_timeout" : "model_network_error",
      provider: candidate.provider,
      model: candidate.model,
      retryable: true
    });
  }

  const responsePayload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = responsePayload?.error?.message || `模型请求失败：HTTP ${response.status}`;
    throw new ModelSelectionError(message, {
      code: "model_http_error",
      provider: candidate.provider,
      model: candidate.model,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500
    });
  }

  const rawText = candidate.provider === "openai"
    ? extractOpenAIText(responsePayload)
    : responsePayload?.choices?.[0]?.message?.content;
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new ModelSelectionError("模型没有返回结构化文本。", {
      code: "model_empty_response",
      provider: candidate.provider,
      model: candidate.model
    });
  }

  let data;
  try {
    data = parseModelJson(rawText);
  } catch {
    throw new ModelSelectionError("模型返回内容不是可解析 JSON。", {
      code: "model_json_parse_failed",
      provider: candidate.provider,
      model: candidate.model,
      rawText
    });
  }

  return {
    data,
    usage: normalizeUsage(candidate.provider, responsePayload?.usage),
    latencyMs: Math.round(performance.now() - startedAt),
    rawHash: sha256(rawText)
  };
}

async function buildOpenAIRequest({ candidate, system, user, schemaName, schema, image }) {
  const userContent = [{ type: "input_text", text: user }];
  if (image) {
    userContent.push({ type: "input_image", image_url: await imageToDataUrl(image) });
  }
  return {
    model: candidate.model,
    store: false,
    reasoning: { effort: candidate.reasoningEffort || "none" },
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: userContent }
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    }
  };
}

async function buildCompatibleRequest({ candidate, system, user, schemaName, schema, image }) {
  const schemaInstruction = [
    system,
    "",
    `只输出符合 ${schemaName} 的 JSON 对象。`,
    "JSON Schema:",
    JSON.stringify(schema)
  ].join("\n");
  const userContent = image
    ? [
        { type: "text", text: user },
        { type: "image_url", image_url: { url: await imageToDataUrl(image) } }
      ]
    : user;
  const request = {
    model: candidate.model,
    messages: [
      { role: "system", content: schemaInstruction },
      { role: "user", content: userContent }
    ],
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0.2,
    max_tokens: 4096
  };
  if (candidate.provider === "deepseek") {
    request.thinking = { type: candidate.thinking || "disabled" };
  }
  if (candidate.provider === "qwen") {
    request.enable_thinking = candidate.thinking === "enabled";
  }
  return request;
}

async function imageToDataUrl(image) {
  const bytes = await readFile(image.path);
  return `data:${image.mimeType};base64,${bytes.toString("base64")}`;
}

function extractOpenAIText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function normalizeUsage(provider, usage = {}) {
  if (provider === "openai") {
    return {
      inputTokens: numberOrZero(usage.input_tokens),
      cachedInputTokens: numberOrZero(usage.input_tokens_details?.cached_tokens),
      outputTokens: numberOrZero(usage.output_tokens)
    };
  }
  return {
    inputTokens: numberOrZero(usage.prompt_tokens),
    cachedInputTokens: numberOrZero(
      usage.prompt_cache_hit_tokens
      ?? usage.prompt_tokens_details?.cached_tokens
    ),
    outputTokens: numberOrZero(usage.completion_tokens)
  };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function assertExplicitCandidate(candidate) {
  for (const key of ["id", "provider", "model", "mode", "endpoint", "apiKeyEnv"]) {
    if (!candidate || candidate[key] === undefined) {
      throw new Error(`ModelCandidate 缺少显式字段：${key}`);
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
