export function validCaptureInput(overrides = {}) {
  return {
    captureId: "capture-001",
    platformHint: "generic_web",
    userRetentionPreference: "long_term",
    ocrRegions: [
      {
        id: "r001",
        text: "主动回忆比重复阅读更能暴露知识缺口。",
        confidence: 0.98,
        boundingBox: [0.1, 0.1, 0.8, 0.1]
      }
    ],
    ...overrides
  };
}

export function validCaptureOutput(overrides = {}) {
  const output = {
    schemaVersion: "capture_analysis_v1",
    disposition: "review",
    contentType: "concept",
    temporality: "long_term",
    riskDomain: "none",
    platformHint: {
      platform: "generic_web",
      confidence: 0.8
    },
    evidenceRegions: [],
    memoryItem: {
      statement: "主动回忆比重复阅读更能暴露知识缺口。",
      whyWorthRemembering: "它能指导复习方式。",
      evidenceRegionIds: ["r001"],
      sourceBasis: "screenshot",
      sourceConfidence: 0.98,
      suggestedQuestionType: "flashcard",
      answer: "主动回忆",
      explanation: "截图明确比较了主动回忆与重复阅读。",
      distractors: [],
      retentionIntent: "long_term"
    },
    question: {
      type: "flashcard",
      prompt: "哪种复习方式更能暴露知识缺口？",
      answer: "主动回忆",
      explanation: "截图明确指出主动回忆更能暴露知识缺口。",
      evidenceRegionIds: ["r001"],
      options: [],
      distractors: []
    },
    warnings: []
  };
  return deepMerge(output, overrides);
}

export function validSyntheticSample(overrides = {}) {
  return deepMerge({
    schemaVersion: "v3_capture_golden_v1",
    sampleId: "sample-001",
    cohort: "web_feed",
    platform: "generic_web",
    difficulty: "normal",
    tags: ["concept"],
    synthetic: true,
    authorized: true,
    deidentified: true,
    input: validCaptureInput(),
    annotation: {
      verifiedVisibleText: "主动回忆比重复阅读更能暴露知识缺口。",
      disposition: "review",
      acceptedMemoryStatements: ["主动回忆比重复阅读更能暴露知识缺口。"],
      acceptableContentTypes: ["concept"],
      evidenceRegionIds: ["r001"],
      riskDomain: "none",
      retentionIntent: "long_term",
      acceptableQuestionTypes: ["flashcard"],
      acceptedAnswers: ["主动回忆"],
      acceptableDistractors: [],
      reviewerCount: 1,
      notes: ""
    }
  }, overrides);
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override ?? base;
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && output[key]
      && typeof output[key] === "object"
      && !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = structuredClone(value);
    }
  }
  return output;
}
