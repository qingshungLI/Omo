const PRICING_CHECKED_AT = "2026-07-23";
const DEFAULT_USD_TO_CNY = 7.2;
export const DEFAULT_PRIMARY_VISION_CANDIDATE_ID = "qwen3.7-plus-vision";
export const DEFAULT_PRIMARY_VISION_MODEL = "qwen3.7-plus-2026-05-26";

const CANDIDATES = [
  {
    id: "deepseek-v4-flash-text",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    mode: "text",
    endpoint: "https://api.deepseek.com/chat/completions",
    apiKeyEnv: ["DEEPSEEK_API_KEY"],
    productionEligibleMainland: true,
    supportsImages: false,
    thinking: "disabled",
    pricing: {
      currency: "USD",
      inputPerMillion: 0.14,
      cachedInputPerMillion: 0.0028,
      outputPerMillion: 0.28
    },
    pricingSource: "https://api-docs.deepseek.com/quick_start/pricing"
  },
  {
    id: "deepseek-v4-pro-text",
    provider: "deepseek",
    model: "deepseek-v4-pro",
    mode: "text",
    endpoint: "https://api.deepseek.com/chat/completions",
    apiKeyEnv: ["DEEPSEEK_API_KEY"],
    productionEligibleMainland: true,
    supportsImages: false,
    thinking: "disabled",
    pricing: {
      currency: "USD",
      inputPerMillion: 0.435,
      cachedInputPerMillion: 0.003625,
      outputPerMillion: 0.87
    },
    pricingSource: "https://api-docs.deepseek.com/quick_start/pricing"
  },
  {
    id: "qwen3.6-flash-text",
    provider: "qwen",
    model: "qwen3.6-flash",
    mode: "text",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    productionEligibleMainland: true,
    supportsImages: true,
    thinking: "disabled",
    pricing: {
      currency: "CNY",
      inputPerMillion: 1.2,
      outputPerMillion: 7.2
    },
    pricingSource: "https://help.aliyun.com/zh/model-studio/models"
  },
  {
    id: "qwen3.7-plus-text",
    provider: "qwen",
    model: DEFAULT_PRIMARY_VISION_MODEL,
    mode: "text",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    productionEligibleMainland: true,
    supportsImages: true,
    thinking: "disabled",
    pricing: {
      currency: "CNY",
      inputPerMillion: 2,
      outputPerMillion: 8
    },
    pricingSource: "https://help.aliyun.com/zh/model-studio/models"
  },
  {
    id: "qwen3-vl-flash-vision",
    provider: "qwen",
    model: "qwen3-vl-flash",
    mode: "vision",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    productionEligibleMainland: true,
    supportsImages: true,
    thinking: "disabled",
    pricing: {
      currency: "CNY",
      inputPerMillion: 0.15,
      outputPerMillion: 1.5,
      tierAssumption: "0<Token<=32K",
      maxInputTokensForPricing: 32_000
    },
    pricingSource: "https://help.aliyun.com/en/model-studio/model-pricing"
  },
  {
    id: "qwen3.6-flash-vision",
    provider: "qwen",
    model: "qwen3.6-flash",
    mode: "vision",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    productionEligibleMainland: true,
    supportsImages: true,
    thinking: "disabled",
    pricing: {
      currency: "CNY",
      inputPerMillion: 1.2,
      outputPerMillion: 7.2
    },
    pricingSource: "https://help.aliyun.com/zh/model-studio/models"
  },
  {
    id: "qwen3.7-plus-vision",
    provider: "qwen",
    model: DEFAULT_PRIMARY_VISION_MODEL,
    mode: "vision",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    apiKeyEnv: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    productionEligibleMainland: true,
    supportsImages: true,
    thinking: "disabled",
    pricing: {
      currency: "CNY",
      inputPerMillion: 2,
      outputPerMillion: 8
    },
    pricingSource: "https://help.aliyun.com/zh/model-studio/models"
  },
  {
    id: "gpt-5.6-terra-vision-control",
    provider: "openai",
    model: "gpt-5.6-terra",
    mode: "vision",
    endpoint: "https://api.openai.com/v1/responses",
    apiKeyEnv: ["OPENAI_API_KEY"],
    productionEligibleMainland: false,
    supportsImages: true,
    reasoningEffort: "none",
    pricing: {
      currency: "USD",
      inputPerMillion: 2.5,
      cachedInputPerMillion: 0.25,
      outputPerMillion: 15
    },
    pricingSource: "https://developers.openai.com/api/docs/models/gpt-5.6-terra"
  }
].map((candidate) => Object.freeze({
  ...candidate,
  pricingCheckedAt: PRICING_CHECKED_AT
}));

const CANDIDATE_BY_ID = new Map(CANDIDATES.map((candidate) => [candidate.id, candidate]));

export function listModelCandidates() {
  return [...CANDIDATES];
}

export function resolveModelCandidate(id) {
  const candidate = CANDIDATE_BY_ID.get(String(id || ""));
  if (!candidate) {
    throw new Error(`未知模型候选：${id}`);
  }
  return candidate;
}

export function resolveCandidateApiKey(candidate, env = process.env) {
  const keyName = candidate.apiKeyEnv.find((name) => String(env[name] || "").trim());
  return keyName
    ? { keyName, value: String(env[keyName]).trim() }
    : { keyName: null, value: null };
}

export function checkCandidateAvailability(candidate, env = process.env) {
  const apiKey = resolveCandidateApiKey(candidate, env);
  return {
    candidateId: candidate.id,
    available: Boolean(apiKey.value),
    keyName: apiKey.keyName,
    missingKeyOptions: apiKey.value ? [] : [...candidate.apiKeyEnv]
  };
}

export function estimateCandidateCostCny(
  candidate,
  usage = {},
  { usdToCny = DEFAULT_USD_TO_CNY } = {}
) {
  if (!candidate.pricing) return null;
  const inputTokens = nonNegativeNumber(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegativeNumber(usage.cachedInputTokens));
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = nonNegativeNumber(usage.outputTokens);
  const pricing = candidate.pricing;
  if (
    pricing.maxInputTokensForPricing
    && inputTokens > pricing.maxInputTokensForPricing
  ) {
    return null;
  }
  const nativeCost = (
    (uncachedInputTokens * pricing.inputPerMillion)
    + (cachedInputTokens * (pricing.cachedInputPerMillion ?? pricing.inputPerMillion))
    + (outputTokens * pricing.outputPerMillion)
  ) / 1_000_000;
  return pricing.currency === "USD" ? nativeCost * usdToCny : nativeCost;
}

export const modelSelectionPricing = Object.freeze({
  checkedAt: PRICING_CHECKED_AT,
  defaultUsdToCny: DEFAULT_USD_TO_CNY
});

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
