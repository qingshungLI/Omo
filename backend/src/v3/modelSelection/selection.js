export const MODEL_SELECTION_THRESHOLDS = Object.freeze({
  evidenceIdValidRate: 1,
  unsafeHighRiskClaimRate: 0,
  unsupportedCriticalTokenRateMax: 0.01,
  firstSchemaPassRate: 0.99,
  afterRepairSchemaPassRate: 1,
  mcqUniqueAnswerRate: 0.98,
  latencyP50MaxMs: 10_000,
  latencyP95MaxMs: 25_000,
  humanMemoryAcceptanceRate: 0.8,
  humanQuestionUsableRate: 0.85,
  humanEvidenceConsistencyRate: 0.95,
  averageAcceptedMemoryCostMaxCny: 0.05
});

export function applyManualReviews(result, reviews = []) {
  const reviewsByBlindId = new Map(reviews.map((review) => [review.blindId, review]));
  return {
    ...result,
    records: result.records.map((record) => ({
      ...record,
      manualReview: reviewsByBlindId.get(record.blindId) || null
    }))
  };
}

export function selectModelPortfolio({
  result,
  textResult,
  datasetReady = Boolean((result || textResult)?.selectionReadyDataset)
}) {
  const benchmarkResult = result || textResult;
  const preferredPrimaryCandidateId = benchmarkResult?.preferredPrimaryCandidateId || null;
  const summaries = aggregateCandidates(benchmarkResult?.records || []);
  const eligible = summaries.filter(
    (summary) => (
      summary.productionEligibleMainland
      && summary.hardGatePassed
      && summary.softTargetFailures.length === 0
    )
  );
  const evidenceIssues = [];

  if (!datasetReady) evidenceIssues.push("golden_set_not_selection_ready");
  if (!summaries.length) evidenceIssues.push("no_results");
  if (summaries.some((summary) => summary.manualReviewCount < summary.recordCount)) {
    evidenceIssues.push("manual_review_incomplete");
  }

  let primary = null;
  let repair = null;
  if (datasetReady && evidenceIssues.length === 0 && eligible.length > 0) {
    if (preferredPrimaryCandidateId) {
      primary = eligible.find(
        (item) => item.candidateId === preferredPrimaryCandidateId
      ) || null;
      if (!primary) {
        evidenceIssues.push(`preferred_primary_not_eligible:${preferredPrimaryCandidateId}`);
      }
    } else {
      const bestAcceptance = Math.max(...eligible.map((item) => item.humanMemoryAcceptanceRate));
      const nearBest = eligible.filter(
        (item) => bestAcceptance - item.humanMemoryAcceptanceRate <= 0.03
      );
      primary = [...nearBest].sort(comparePrimary)[0] || null;
    }
    repair = [...eligible]
      .filter((item) => item.candidateId !== primary?.candidateId)
      .sort(compareRepair)[0] || primary;
  }

  const go = Boolean(primary && repair);

  return {
    schemaVersion: "v3_model_selection_decision_v1",
    generatedAt: new Date().toISOString(),
    status: go ? "go" : "no_go",
    reason: go
      ? "quality_gate_passed"
      : (evidenceIssues.length ? "insufficient_evidence" : "no_candidate_passed_hard_gate"),
    evidenceIssues: [...new Set(evidenceIssues)],
    preferredPrimaryCandidateId,
    primaryCandidateId: primary?.candidateId || null,
    repairCandidateId: repair?.candidateId || null,
    thresholds: MODEL_SELECTION_THRESHOLDS,
    candidateSummaries: summaries
  };
}

export function aggregateCandidates(records) {
  const groups = groupBy(records, (record) => record.candidateId);
  return [...groups.entries()].map(([candidateId, candidateRecords]) => {
    const complete = candidateRecords.filter((record) => record.status !== "failed");
    const mcqRecords = complete.filter((record) => record.quality?.mcqUniqueAnswer !== null);
    const reviews = complete.map((record) => record.manualReview).filter(Boolean);
    const acceptedReviews = reviews.filter((review) => review.memoryAccepted === true);
    const allCostsKnown = complete.every((record) => Number.isFinite(record.costCny));
    const totalCost = sum(complete.map((record) => record.costCny));
    const passedAcceptedCount = acceptedReviews.length;
    const criticalTokenCount = sum(
      complete.map((record) => record.quality?.criticalTokenCount)
    );
    const unsupportedCriticalTokenCount = sum(
      complete.map((record) => record.quality?.unsupportedCriticalTokenCount)
    );
    const summary = {
      candidateId,
      provider: candidateRecords[0]?.provider || null,
      model: candidateRecords[0]?.model || null,
      mode: candidateRecords[0]?.mode || null,
      productionEligibleMainland: Boolean(candidateRecords[0]?.productionEligibleMainland),
      recordCount: candidateRecords.length,
      completedCount: complete.length,
      failedCount: candidateRecords.length - complete.length,
      manualReviewCount: reviews.length,
      evidenceIdValidRate: rate(complete, (record) => record.quality?.evidenceIdsValid === true),
      visualEvidenceValidRate: rate(
        complete,
        (record) => record.quality?.visualEvidenceValid !== false
      ),
      unsafeHighRiskClaimRate: rate(complete, (record) => record.quality?.unsafeHighRiskClaim === true),
      unsupportedCriticalTokenRate: criticalTokenCount > 0
        ? unsupportedCriticalTokenCount / criticalTokenCount
        : rate(complete, (record) => record.quality?.unsupportedCriticalToken === true),
      firstSchemaPassRate: rate(complete, (record) => record.firstSchemaPassed === true),
      afterRepairSchemaPassRate: rate(complete, (record) => record.afterRepairSchemaPassed === true),
      mcqUniqueAnswerRate: mcqRecords.length
        ? rate(mcqRecords, (record) => record.quality?.mcqUniqueAnswer === true)
        : 1,
      latencyP50Ms: percentile(complete.map((record) => record.latencyMs), 0.5),
      latencyP95Ms: percentile(complete.map((record) => record.latencyMs), 0.95),
      humanMemoryAcceptanceRate: rate(reviews, (review) => review.memoryAccepted === true),
      humanQuestionUsableRate: rate(reviews, (review) => review.questionUsable === true),
      humanEvidenceConsistencyRate: rate(
        reviews,
        (review) => review.evidenceExplanationConsistent === true
      ),
      averageAcceptedMemoryCostCny: allCostsKnown && passedAcceptedCount > 0
        ? totalCost / passedAcceptedCount
        : null,
      averageRunCostCny: allCostsKnown && complete.length ? totalCost / complete.length : null
    };
    summary.hardGateFailures = hardGateFailures(summary);
    summary.hardGatePassed = summary.hardGateFailures.length === 0;
    summary.softTargetFailures = softTargetFailures(summary);
    return summary;
  });
}

function hardGateFailures(summary) {
  const threshold = MODEL_SELECTION_THRESHOLDS;
  const checks = [
    ["all_runs_completed", summary.completedCount === summary.recordCount],
    ["evidence_id_valid_rate", summary.evidenceIdValidRate >= threshold.evidenceIdValidRate],
    ["visual_evidence_valid_rate", summary.visualEvidenceValidRate >= 1],
    ["unsafe_high_risk_claim_rate", summary.unsafeHighRiskClaimRate <= threshold.unsafeHighRiskClaimRate],
    [
      "unsupported_critical_token_rate",
      summary.unsupportedCriticalTokenRate <= threshold.unsupportedCriticalTokenRateMax
    ],
    ["first_schema_pass_rate", summary.firstSchemaPassRate >= threshold.firstSchemaPassRate],
    [
      "after_repair_schema_pass_rate",
      summary.afterRepairSchemaPassRate >= threshold.afterRepairSchemaPassRate
    ],
    ["mcq_unique_answer_rate", summary.mcqUniqueAnswerRate >= threshold.mcqUniqueAnswerRate],
    ["latency_p50", summary.latencyP50Ms <= threshold.latencyP50MaxMs],
    ["latency_p95", summary.latencyP95Ms <= threshold.latencyP95MaxMs]
  ];
  return checks.filter(([, passed]) => !passed).map(([name]) => name);
}

function softTargetFailures(summary) {
  const threshold = MODEL_SELECTION_THRESHOLDS;
  const checks = [
    [
      "human_memory_acceptance_rate",
      summary.humanMemoryAcceptanceRate >= threshold.humanMemoryAcceptanceRate
    ],
    [
      "human_question_usable_rate",
      summary.humanQuestionUsableRate >= threshold.humanQuestionUsableRate
    ],
    [
      "human_evidence_consistency_rate",
      summary.humanEvidenceConsistencyRate >= threshold.humanEvidenceConsistencyRate
    ],
    [
      "average_accepted_memory_cost",
      summary.averageAcceptedMemoryCostCny !== null
        && summary.averageAcceptedMemoryCostCny <= threshold.averageAcceptedMemoryCostMaxCny
    ]
  ];
  return checks.filter(([, passed]) => !passed).map(([name]) => name);
}

function comparePrimary(left, right) {
  return (
    nullableNumber(left.averageAcceptedMemoryCostCny) - nullableNumber(right.averageAcceptedMemoryCostCny)
    || left.latencyP50Ms - right.latencyP50Ms
    || right.humanMemoryAcceptanceRate - left.humanMemoryAcceptanceRate
  );
}

function compareRepair(left, right) {
  return (
    right.humanMemoryAcceptanceRate - left.humanMemoryAcceptanceRate
    || right.humanQuestionUsableRate - left.humanQuestionUsableRate
    || left.latencyP50Ms - right.latencyP50Ms
  );
}

function groupBy(values, keyFn) {
  const output = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!output.has(key)) output.set(key, []);
    output.get(key).push(value);
  }
  return output;
}

function rate(values, predicate) {
  if (!values.length) return null;
  return values.filter(predicate).length / values.length;
}

function percentile(values, quantile) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return Number.POSITIVE_INFINITY;
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function nullableNumber(value) {
  return value === null || value === undefined ? Number.POSITIVE_INFINITY : value;
}
