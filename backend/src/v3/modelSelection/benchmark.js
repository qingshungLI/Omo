import { createHash } from "node:crypto";
import {
  captureAnalysisJsonSchema,
  validateCaptureAnalysisOutput
} from "./contracts.js";
import {
  estimateCandidateCostCny,
  modelSelectionPricing
} from "./candidates.js";
import { buildCaptureAnalysisPrompt, buildSchemaRepairPrompt } from "./prompt.js";
import { evaluateCaptureAnalysis, extractCriticalTokens } from "./qualityGate.js";
import { scoreAgainstAnnotation } from "./scoring.js";
import { callModelCandidate, ModelSelectionError } from "./providerClient.js";

export const MODEL_RUN_RECORD_VERSION = "v3_model_run_record_v1";

export async function runModelSelectionBenchmark({
  dataset,
  candidates,
  phase = "vision",
  preferredPrimaryCandidateId = null,
  sampleIds = null,
  env = process.env,
  callCandidate = callModelCandidate,
  usdToCny = modelSelectionPricing.defaultUsdToCny,
  onRecord = null
}) {
  if (!dataset?.validation?.validForDevelopment) {
    throw new Error("Golden Set 未通过开发校验，不能运行 benchmark。");
  }
  const selectedIds = sampleIds ? new Set(sampleIds) : null;
  const samples = dataset.samples.filter((sample) => !selectedIds || selectedIds.has(sample.sampleId));
  const phaseCandidates = candidates.filter((candidate) => candidate.mode === phase);
  if (!phaseCandidates.length) {
    throw new Error(`没有 mode=${phase} 的模型候选。`);
  }

  const records = [];
  for (const sample of samples) {
    for (const candidate of phaseCandidates) {
      const record = await runSingleCandidate({
        datasetId: dataset.datasetId,
        sample,
        candidate,
        env,
        callCandidate,
        usdToCny
      });
      records.push(record);
      if (onRecord) await onRecord(record);
    }
  }

  return {
    schemaVersion: "v3_model_benchmark_result_v1",
    datasetId: dataset.datasetId,
    phase,
    createdAt: new Date().toISOString(),
    pricingCheckedAt: modelSelectionPricing.checkedAt,
    usdToCny,
    selectionReadyDataset: dataset.validation.readyForSelection,
    preferredPrimaryCandidateId,
    recordCount: records.length,
    candidateIds: phaseCandidates.map((candidate) => candidate.id),
    records
  };
}

async function runSingleCandidate({
  datasetId,
  sample,
  candidate,
  env,
  callCandidate,
  usdToCny
}) {
  const directImage = candidate.mode === "vision";
  const allowedEvidenceIds = directImage
    ? []
    : sample.input.ocrRegions.map((region) => region.id);
  const prompt = buildCaptureAnalysisPrompt(sample.input, {
    includeOcrRegions: !directImage
  });
  const baseRecord = {
    schemaVersion: MODEL_RUN_RECORD_VERSION,
    blindId: blindId(datasetId, sample.sampleId, candidate.id),
    sampleId: sample.sampleId,
    cohort: sample.cohort,
    difficulty: sample.difficulty,
    candidateId: candidate.id,
    provider: candidate.provider,
    model: candidate.model,
    mode: candidate.mode,
    productionEligibleMainland: candidate.productionEligibleMainland,
    promptVersion: "capture_analysis_prompt_v1",
    outputSchemaVersion: "capture_analysis_v1",
    status: "failed",
    firstSchemaPassed: false,
    afterRepairSchemaPassed: false,
    repairAttempted: false,
    latencyMs: 0,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    costCny: candidate.pricing ? 0 : null,
    error: null,
    outputDigest: null,
    reviewPreview: null,
    quality: null,
    autoScore: null
  };

  let output = null;
  let firstResult = null;
  let schemaIssues = [];
  try {
    firstResult = await callCandidate({
      candidate,
      system: prompt.system,
      user: prompt.user,
      schemaName: "capture_analysis",
      schema: captureAnalysisJsonSchema,
      image: candidate.mode === "vision" ? sample.input.image : null,
      env
    });
    output = firstResult.data;
    accumulateModelResult(baseRecord, firstResult, candidate, usdToCny);
    schemaIssues = validateCaptureAnalysisOutput(output, { allowedEvidenceIds });
    baseRecord.firstSchemaPassed = schemaIssues.length === 0;
    baseRecord.afterRepairSchemaPassed = baseRecord.firstSchemaPassed;
  } catch (error) {
    if (!(error instanceof ModelSelectionError) || error.code !== "model_json_parse_failed") {
      return failedRecord(baseRecord, error);
    }
    baseRecord.error = serializeError(error);
    schemaIssues = [{ code: error.code, path: "$", message: error.message }];
    output = error.rawText;
  }

  if (schemaIssues.length > 0) {
    baseRecord.repairAttempted = true;
    const repairPrompt = buildSchemaRepairPrompt({
      previousOutput: typeof output === "string" ? output : JSON.stringify(output),
      schemaIssues
    });
    try {
      const repairResult = await callCandidate({
        candidate,
        system: repairPrompt.system,
        user: repairPrompt.user,
        schemaName: "capture_analysis",
        schema: captureAnalysisJsonSchema,
        image: candidate.mode === "vision" ? sample.input.image : null,
        env
      });
      output = repairResult.data;
      accumulateModelResult(baseRecord, repairResult, candidate, usdToCny);
      schemaIssues = validateCaptureAnalysisOutput(output, { allowedEvidenceIds });
      baseRecord.afterRepairSchemaPassed = schemaIssues.length === 0;
      baseRecord.error = null;
    } catch (error) {
      return failedRecord(baseRecord, error);
    }
  }

  let quality = evaluateCaptureAnalysis({
    input: directImage ? { ...sample.input, ocrRegions: [] } : sample.input,
    output,
    schemaIssues
  });
  if (directImage) {
    quality = appendQualityFindings(
      quality,
      evaluateVisualEvidence(output.evidenceRegions, sample.annotation.verifiedVisibleText)
    );
  }
  const criticalTokens = [
    ...extractCriticalTokens(output?.memoryItem?.statement),
    ...extractCriticalTokens(output?.memoryItem?.answer),
    ...extractCriticalTokens(output?.question?.answer)
  ];
  const unsupportedCriticalTokenCount = quality.findings.filter(
    (item) => item.code === "unsupported_critical_token"
  ).length;
  const autoScore = scoreAgainstAnnotation(output, sample.annotation);
  baseRecord.quality = {
    verdict: quality.verdict,
    passed: quality.passed,
    counts: quality.counts,
    findingCodes: quality.findings.map((item) => item.code),
    evidenceIdsValid: !quality.findings.some((item) => item.code === "evidence_unknown_id"),
    unsafeHighRiskClaim: quality.findings.some((item) => item.code === "unsafe_high_risk_certainty"),
    unsupportedCriticalToken: unsupportedCriticalTokenCount > 0,
    unsupportedCriticalTokenCount,
    criticalTokenCount: new Set(criticalTokens).size,
    visualEvidenceValid: !quality.findings.some(
      (item) => ["visual_evidence_missing", "visual_evidence_not_in_golden"].includes(item.code)
    ),
    mcqUniqueAnswer: output?.question?.type === "multiple_choice"
      ? !quality.findings.some((item) => item.code.startsWith("mcq_"))
      : null
  };
  baseRecord.autoScore = autoScore;
  baseRecord.status = baseRecord.afterRepairSchemaPassed
    ? (quality.passed ? "passed_quality_gate" : `quality_${quality.verdict}`)
    : "schema_failed_after_repair";
  baseRecord.outputDigest = sha256(JSON.stringify(output));
  baseRecord.reviewPreview = buildReviewPreview(output, sample.input);
  return baseRecord;
}

function accumulateModelResult(record, result, candidate, usdToCny) {
  record.latencyMs += Number(result.latencyMs) || 0;
  record.usage.inputTokens += Number(result.usage?.inputTokens) || 0;
  record.usage.cachedInputTokens += Number(result.usage?.cachedInputTokens) || 0;
  record.usage.outputTokens += Number(result.usage?.outputTokens) || 0;
  record.costCny = estimateCandidateCostCny(candidate, record.usage, { usdToCny });
}

function failedRecord(record, error) {
  record.status = "failed";
  record.error = serializeError(error);
  return record;
}

function serializeError(error) {
  return {
    code: error?.code || "benchmark_error",
    message: error?.message || String(error),
    status: error?.status || null,
    retryable: Boolean(error?.retryable),
    rawHash: error?.rawHash || null
  };
}

function buildReviewPreview(output, input) {
  if (!output || typeof output !== "object") return null;
  const evidenceIds = [
    ...(output.memoryItem?.evidenceRegionIds || []),
    ...(output.question?.evidenceRegionIds || [])
  ];
  const uniqueEvidenceIds = [...new Set(evidenceIds)];
  const regionById = new Map([
    ...input.ocrRegions.map((region) => [region.id, region]),
    ...(output.evidenceRegions || []).map((region) => [region.id, region])
  ]);
  return {
    disposition: output.disposition,
    memoryStatement: output.memoryItem?.statement || "",
    whyWorthRemembering: output.memoryItem?.whyWorthRemembering || "",
    evidenceRegionIds: uniqueEvidenceIds,
    citedEvidence: uniqueEvidenceIds.map((id) => ({
      id,
      text: regionById.get(id)?.text || ""
    })),
    questionType: output.question?.type || null,
    questionPrompt: output.question?.prompt || "",
    answer: output.question?.answer || "",
    explanation: output.question?.explanation || ""
  };
}

function evaluateVisualEvidence(regions, correctedOcrText) {
  const reference = normalizeEvidenceText(correctedOcrText);
  if (!Array.isArray(regions) || !regions.length) {
    return [{
      code: "visual_evidence_missing",
      severity: "block",
      path: "$.evidenceRegions",
      message: "直接图片模式必须返回至少一个可核验的证据区域。"
    }];
  }
  return regions.flatMap((region, index) => {
    const evidence = normalizeEvidenceText(region.text);
    const supported = evidence.length >= 2 && reference.includes(evidence);
    return supported ? [] : [{
      code: "visual_evidence_not_in_golden",
      severity: "block",
      path: `$.evidenceRegions[${index}].text`,
      message: "视觉模型抄录的证据无法在人工校正文本中核验。"
    }];
  });
}

function appendQualityFindings(quality, extraFindings) {
  if (!extraFindings.length) return quality;
  const findings = [...quality.findings, ...extraFindings];
  const counts = { block: 0, repair: 0, downgrade: 0, diagnostic: 0 };
  for (const item of findings) counts[item.severity] = (counts[item.severity] || 0) + 1;
  const verdict = counts.block > 0
    ? "reject"
    : counts.repair > 0
      ? "repair"
      : counts.downgrade > 0
        ? "downgrade"
        : "pass";
  return { verdict, passed: verdict === "pass", counts, findings };
}

function normalizeEvidenceText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function blindId(datasetId, sampleId, candidateId) {
  return sha256(`${datasetId}\u0000${sampleId}\u0000${candidateId}`).slice(0, 16);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
