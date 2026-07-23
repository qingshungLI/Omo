const DISPOSITIONS = ["review", "archive_only", "needs_confirmation", "unsupported"];
const CONTENT_TYPES = [
  "fact",
  "concept",
  "method",
  "comparison",
  "opinion",
  "list",
  "reminder",
  "inspiration"
];
const TEMPORALITIES = ["recent", "long_term", "archive"];
const RISK_DOMAINS = ["none", "medical", "legal", "financial", "safety"];
const RETENTION_INTENTS = ["recent", "long_term", "archive"];
const QUESTION_TYPES = ["flashcard", "multiple_choice", "true_false", "keyword_recall"];
const SOURCE_BASES = ["screenshot"];

export const CAPTURE_ANALYSIS_SCHEMA_VERSION = "capture_analysis_v1";
export const CAPTURE_GOLDEN_SCHEMA_VERSION = "v3_capture_golden_v1";

const stringSchema = { type: "string" };

export const captureAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "disposition",
    "contentType",
    "temporality",
    "riskDomain",
    "platformHint",
    "evidenceRegions",
    "memoryItem",
    "question",
    "warnings"
  ],
  properties: {
    schemaVersion: { type: "string", enum: [CAPTURE_ANALYSIS_SCHEMA_VERSION] },
    disposition: { type: "string", enum: DISPOSITIONS },
    contentType: { type: "string", enum: CONTENT_TYPES },
    temporality: { type: "string", enum: TEMPORALITIES },
    riskDomain: { type: "string", enum: RISK_DOMAINS },
    platformHint: {
      type: "object",
      additionalProperties: false,
      required: ["platform", "confidence"],
      properties: {
        platform: stringSchema,
        confidence: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    evidenceRegions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "confidence", "boundingBox"],
        properties: {
          id: stringSchema,
          text: stringSchema,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          boundingBox: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "number", minimum: 0, maximum: 1 }
          }
        }
      }
    },
    memoryItem: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "statement",
            "whyWorthRemembering",
            "evidenceRegionIds",
            "sourceBasis",
            "sourceConfidence",
            "suggestedQuestionType",
            "answer",
            "explanation",
            "distractors",
            "retentionIntent"
          ],
          properties: {
            statement: stringSchema,
            whyWorthRemembering: stringSchema,
            evidenceRegionIds: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: stringSchema
            },
            sourceBasis: { type: "string", enum: SOURCE_BASES },
            sourceConfidence: { type: "number", minimum: 0, maximum: 1 },
            suggestedQuestionType: { type: "string", enum: QUESTION_TYPES },
            answer: stringSchema,
            explanation: stringSchema,
            distractors: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "whyWrong"],
                properties: {
                  text: stringSchema,
                  whyWrong: stringSchema
                }
              }
            },
            retentionIntent: { type: "string", enum: RETENTION_INTENTS }
          }
        }
      ]
    },
    question: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "type",
            "prompt",
            "answer",
            "explanation",
            "evidenceRegionIds",
            "options",
            "distractors"
          ],
          properties: {
            type: { type: "string", enum: QUESTION_TYPES },
            prompt: stringSchema,
            answer: stringSchema,
            explanation: stringSchema,
            evidenceRegionIds: {
              type: "array",
              minItems: 1,
              uniqueItems: true,
              items: stringSchema
            },
            options: {
              type: "array",
              uniqueItems: true,
              items: stringSchema
            },
            distractors: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "whyWrong"],
                properties: {
                  text: stringSchema,
                  whyWrong: stringSchema
                }
              }
            }
          }
        }
      ]
    },
    warnings: {
      type: "array",
      uniqueItems: true,
      items: stringSchema
    }
  }
};

export function validateCaptureAnalysisInput(input) {
  const issues = [];
  if (!isPlainObject(input)) {
    return [issue("schema_input_type", "$", "CaptureAnalysisInput 必须是对象。")];
  }

  requireNonEmptyString(input.captureId, "$.captureId", issues);

  if (!Array.isArray(input.ocrRegions)) {
    issues.push(issue("schema_input_regions", "$.ocrRegions", "ocrRegions 必须是数组。"));
    return issues;
  }
  if (input.ocrRegions.length === 0 && !input.image) {
    issues.push(issue("schema_input_source", "$", "OCR 区域和图片至少需要一种输入。"));
  }
  if (input.ocrRegions.length > 240) {
    issues.push(issue("schema_input_regions_limit", "$.ocrRegions", "OCR 区域不能超过 240 个。"));
  }

  const seen = new Set();
  input.ocrRegions.forEach((region, index) => {
    const path = `$.ocrRegions[${index}]`;
    if (!isPlainObject(region)) {
      issues.push(issue("schema_input_region_type", path, "OCR 区域必须是对象。"));
      return;
    }
    requireNonEmptyString(region.id, `${path}.id`, issues);
    requireNonEmptyString(region.text, `${path}.text`, issues);
    if (typeof region.id === "string") {
      if (seen.has(region.id)) {
        issues.push(issue("schema_input_duplicate_evidence", `${path}.id`, "Evidence ID 必须唯一。"));
      }
      seen.add(region.id);
    }
    if (!isUnitInterval(region.confidence)) {
      issues.push(issue("schema_input_confidence", `${path}.confidence`, "置信度必须在 0 到 1 之间。"));
    }
    if (!isBoundingBox(region.boundingBox)) {
      issues.push(issue(
        "schema_input_bounding_box",
        `${path}.boundingBox`,
        "boundingBox 必须是归一化的 [x, y, width, height]。"
      ));
    }
  });

  if (input.image !== undefined && input.image !== null) {
    if (!isPlainObject(input.image)) {
      issues.push(issue("schema_input_image_type", "$.image", "image 必须是对象或 null。"));
    } else {
      requireNonEmptyString(input.image.path, "$.image.path", issues);
      requireNonEmptyString(input.image.mimeType, "$.image.mimeType", issues);
      if (input.image.consentToCloudAnalysis !== true) {
        issues.push(issue(
          "privacy_image_consent",
          "$.image.consentToCloudAnalysis",
          "云端视觉分析必须有明确同意。"
        ));
      }
    }
  }

  return issues;
}

export function validateCaptureAnalysisOutput(output, { allowedEvidenceIds = [] } = {}) {
  const issues = [];
  if (!isPlainObject(output)) {
    return [issue("schema_output_type", "$", "CaptureAnalysisOutput 必须是对象。")];
  }

  validateExactKeys(output, captureAnalysisJsonSchema.required, "$", issues);
  validateEnum(output.schemaVersion, [CAPTURE_ANALYSIS_SCHEMA_VERSION], "$.schemaVersion", issues);
  validateEnum(output.disposition, DISPOSITIONS, "$.disposition", issues);
  validateEnum(output.contentType, CONTENT_TYPES, "$.contentType", issues);
  validateEnum(output.temporality, TEMPORALITIES, "$.temporality", issues);
  validateEnum(output.riskDomain, RISK_DOMAINS, "$.riskDomain", issues);

  if (!isPlainObject(output.platformHint)) {
    issues.push(issue("schema_platform_hint", "$.platformHint", "platformHint 必须是对象。"));
  } else {
    validateExactKeys(output.platformHint, ["platform", "confidence"], "$.platformHint", issues);
    if (typeof output.platformHint.platform !== "string") {
      issues.push(issue("schema_platform", "$.platformHint.platform", "platform 必须是字符串。"));
    }
    if (!isUnitInterval(output.platformHint.confidence)) {
      issues.push(issue("schema_platform_confidence", "$.platformHint.confidence", "平台置信度必须在 0 到 1 之间。"));
    }
  }

  if (!Array.isArray(output.warnings) || output.warnings.some((warning) => typeof warning !== "string")) {
    issues.push(issue("schema_warnings", "$.warnings", "warnings 必须是字符串数组。"));
  }

  const generatedEvidence = validateGeneratedEvidenceRegions(output.evidenceRegions, issues);
  const allowedEvidence = new Set([...allowedEvidenceIds, ...generatedEvidence]);
  const expectsMemoryItem = ["review", "needs_confirmation"].includes(output.disposition);
  if (expectsMemoryItem && !isPlainObject(output.memoryItem)) {
    issues.push(issue("schema_memory_required", "$.memoryItem", "该 disposition 必须返回一个记忆点。"));
  }
  if (!expectsMemoryItem && output.memoryItem !== null) {
    issues.push(issue("schema_memory_forbidden", "$.memoryItem", "仅存档或不支持时 memoryItem 必须为 null。"));
  }
  if (isPlainObject(output.memoryItem)) {
    validateMemoryItem(output.memoryItem, allowedEvidence, issues);
  }

  if (output.disposition === "review" && !isPlainObject(output.question)) {
    issues.push(issue("schema_question_required", "$.question", "可复习内容必须返回首道题。"));
  }
  if (output.disposition !== "review" && output.question !== null) {
    issues.push(issue("schema_question_forbidden", "$.question", "非 review 状态的 question 必须为 null。"));
  }
  if (isPlainObject(output.question)) {
    validateQuestion(output.question, allowedEvidence, issues);
  }

  if (isPlainObject(output.memoryItem) && isPlainObject(output.question)) {
    if (output.memoryItem.suggestedQuestionType !== output.question.type) {
      issues.push(issue(
        "schema_question_type_mismatch",
        "$.question.type",
        "题目类型必须与记忆点建议题型一致。"
      ));
    }
    if (normalizeText(output.memoryItem.answer) !== normalizeText(output.question.answer)) {
      issues.push(issue("schema_answer_mismatch", "$.question.answer", "题目答案必须与记忆点答案一致。"));
    }
  }

  return issues;
}

function validateGeneratedEvidenceRegions(regions, issues) {
  if (!Array.isArray(regions)) {
    issues.push(issue("schema_evidence_regions", "$.evidenceRegions", "evidenceRegions 必须是数组。"));
    return [];
  }
  if (regions.length > 12) {
    issues.push(issue("schema_evidence_regions_limit", "$.evidenceRegions", "证据区域不能超过 12 个。"));
  }
  const ids = [];
  const seen = new Set();
  regions.forEach((region, index) => {
    const basePath = `$.evidenceRegions[${index}]`;
    if (!isPlainObject(region)) {
      issues.push(issue("schema_evidence_region_type", basePath, "证据区域必须是对象。"));
      return;
    }
    validateExactKeys(region, ["id", "text", "confidence", "boundingBox"], basePath, issues);
    requireNonEmptyString(region.id, `${basePath}.id`, issues);
    requireNonEmptyString(region.text, `${basePath}.text`, issues);
    if (typeof region.id === "string" && region.id.trim()) {
      if (seen.has(region.id)) {
        issues.push(issue("schema_evidence_region_duplicate", `${basePath}.id`, "证据区域 ID 必须唯一。"));
      }
      seen.add(region.id);
      ids.push(region.id);
    }
    if (!isUnitInterval(region.confidence)) {
      issues.push(issue("schema_evidence_region_confidence", `${basePath}.confidence`, "置信度必须在 0 到 1 之间。"));
    }
    if (!isBoundingBox(region.boundingBox)) {
      issues.push(issue("schema_evidence_region_box", `${basePath}.boundingBox`, "证据区域坐标无效。"));
    }
  });
  return ids;
}

function validateMemoryItem(item, allowedEvidence, issues) {
  const keys = [
    "statement",
    "whyWorthRemembering",
    "evidenceRegionIds",
    "sourceBasis",
    "sourceConfidence",
    "suggestedQuestionType",
    "answer",
    "explanation",
    "distractors",
    "retentionIntent"
  ];
  validateExactKeys(item, keys, "$.memoryItem", issues);
  for (const key of ["statement", "whyWorthRemembering", "answer", "explanation"]) {
    requireNonEmptyString(item[key], `$.memoryItem.${key}`, issues);
  }
  validateEvidenceIds(item.evidenceRegionIds, allowedEvidence, "$.memoryItem.evidenceRegionIds", issues);
  validateEnum(item.sourceBasis, SOURCE_BASES, "$.memoryItem.sourceBasis", issues);
  if (!isUnitInterval(item.sourceConfidence)) {
    issues.push(issue("schema_source_confidence", "$.memoryItem.sourceConfidence", "来源置信度必须在 0 到 1 之间。"));
  }
  validateEnum(item.suggestedQuestionType, QUESTION_TYPES, "$.memoryItem.suggestedQuestionType", issues);
  validateEnum(item.retentionIntent, RETENTION_INTENTS, "$.memoryItem.retentionIntent", issues);
  validateDistractors(item.distractors, "$.memoryItem.distractors", issues);
}

function validateQuestion(question, allowedEvidence, issues) {
  const keys = ["type", "prompt", "answer", "explanation", "evidenceRegionIds", "options", "distractors"];
  validateExactKeys(question, keys, "$.question", issues);
  validateEnum(question.type, QUESTION_TYPES, "$.question.type", issues);
  for (const key of ["prompt", "answer", "explanation"]) {
    requireNonEmptyString(question[key], `$.question.${key}`, issues);
  }
  validateEvidenceIds(question.evidenceRegionIds, allowedEvidence, "$.question.evidenceRegionIds", issues);
  if (!Array.isArray(question.options) || question.options.some((option) => typeof option !== "string")) {
    issues.push(issue("schema_question_options", "$.question.options", "options 必须是字符串数组。"));
  }
  validateDistractors(question.distractors, "$.question.distractors", issues);
}

function validateDistractors(distractors, path, issues) {
  if (!Array.isArray(distractors)) {
    issues.push(issue("schema_distractors", path, "distractors 必须是数组。"));
    return;
  }
  distractors.forEach((distractor, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainObject(distractor)) {
      issues.push(issue("schema_distractor_type", itemPath, "干扰项必须是对象。"));
      return;
    }
    validateExactKeys(distractor, ["text", "whyWrong"], itemPath, issues);
    requireNonEmptyString(distractor.text, `${itemPath}.text`, issues);
    requireNonEmptyString(distractor.whyWrong, `${itemPath}.whyWrong`, issues);
  });
}

function validateEvidenceIds(ids, allowedEvidence, path, issues) {
  if (!Array.isArray(ids) || ids.length === 0) {
    issues.push(issue("schema_evidence_required", path, "至少需要一个 Evidence ID。"));
    return;
  }
  const seen = new Set();
  ids.forEach((id, index) => {
    if (typeof id !== "string" || !id.trim()) {
      issues.push(issue("schema_evidence_type", `${path}[${index}]`, "Evidence ID 必须是非空字符串。"));
      return;
    }
    if (seen.has(id)) {
      issues.push(issue("schema_evidence_duplicate", `${path}[${index}]`, "Evidence ID 不能重复。"));
    }
    seen.add(id);
    if (allowedEvidence.size > 0 && !allowedEvidence.has(id)) {
      issues.push(issue("evidence_unknown_id", `${path}[${index}]`, "模型引用了输入中不存在的 Evidence ID。"));
    }
  });
}

function validateExactKeys(value, requiredKeys, path, issues) {
  if (!isPlainObject(value)) return;
  const required = new Set(requiredKeys);
  for (const key of requiredKeys) {
    if (!(key in value)) {
      issues.push(issue("schema_missing_key", `${path}.${key}`, `缺少字段 ${key}。`));
    }
  }
  for (const key of Object.keys(value)) {
    if (!required.has(key)) {
      issues.push(issue("schema_extra_key", `${path}.${key}`, `不允许额外字段 ${key}。`));
    }
  }
}

function validateEnum(value, allowed, path, issues) {
  if (!allowed.includes(value)) {
    issues.push(issue("schema_enum", path, `值必须是：${allowed.join(", ")}。`));
  }
}

function requireNonEmptyString(value, path, issues) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("schema_non_empty_string", path, "必须是非空字符串。"));
  }
}

function isBoundingBox(value) {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every(isUnitInterval)) return false;
  const [, , width, height] = value;
  return width > 0 && height > 0;
}

function isUnitInterval(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(code, path, message) {
  return { code, path, message };
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

export const captureAnalysisEnums = Object.freeze({
  dispositions: DISPOSITIONS,
  contentTypes: CONTENT_TYPES,
  temporalities: TEMPORALITIES,
  riskDomains: RISK_DOMAINS,
  retentionIntents: RETENTION_INTENTS,
  questionTypes: QUESTION_TYPES,
  sourceBases: SOURCE_BASES
});
