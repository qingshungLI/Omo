import assert from "node:assert/strict";
import test from "node:test";
import { selectModelPortfolio } from "./selection.js";

test("selection chooses cheaper mainland model within three percentage points", () => {
  const textResult = {
    selectionReadyDataset: true,
    records: [
      record("quality", "sample-1", 0.004, true),
      record("cheap", "sample-1", 0.001, true)
    ]
  };
  const decision = selectModelPortfolio({
    result: textResult
  });
  assert.equal(decision.status, "go");
  assert.equal(decision.primaryCandidateId, "cheap");
  assert.equal(decision.repairCandidateId, "quality");
});

test("selection honors an eligible product-selected primary model", () => {
  const result = {
    selectionReadyDataset: true,
    preferredPrimaryCandidateId: "quality",
    records: [
      record("quality", "sample-1", 0.004, true),
      record("cheap", "sample-1", 0.001, true)
    ]
  };
  const decision = selectModelPortfolio({ result });
  assert.equal(decision.status, "go");
  assert.equal(decision.preferredPrimaryCandidateId, "quality");
  assert.equal(decision.primaryCandidateId, "quality");
  assert.equal(decision.repairCandidateId, "cheap");
});

test("selection does not silently replace an ineligible product-selected primary model", () => {
  const result = {
    selectionReadyDataset: true,
    preferredPrimaryCandidateId: "preferred",
    records: [
      { ...record("preferred", "sample-1", 0.004, false) },
      record("fallback", "sample-1", 0.001, true)
    ]
  };
  const decision = selectModelPortfolio({ result });
  assert.equal(decision.status, "no_go");
  assert.equal(decision.primaryCandidateId, null);
  assert.equal(
    decision.evidenceIssues.includes("preferred_primary_not_eligible:preferred"),
    true
  );
});

test("incomplete manual review prevents go", () => {
  const textResult = {
    selectionReadyDataset: true,
    records: [{ ...record("candidate", "sample-1", 0.001, true), manualReview: null }]
  };
  const decision = selectModelPortfolio({ result: textResult });
  assert.equal(decision.status, "no_go");
  assert.equal(decision.evidenceIssues.includes("manual_review_incomplete"), true);
});

test("unknown model cost prevents selection", () => {
  const result = {
    selectionReadyDataset: true,
    records: [{ ...record("candidate", "sample-1", 0.001, true), costCny: null }]
  };
  const decision = selectModelPortfolio({ result });
  assert.equal(decision.status, "no_go");
  assert.equal(
    decision.candidateSummaries[0].softTargetFailures.includes("average_accepted_memory_cost"),
    true
  );
});

function record(candidateId, sampleId, costCny, accepted) {
  return {
    candidateId,
    sampleId,
    provider: "qwen",
    model: candidateId,
    mode: "text",
    productionEligibleMainland: true,
    status: "passed_quality_gate",
    firstSchemaPassed: true,
    afterRepairSchemaPassed: true,
    latencyMs: 100,
    costCny,
    quality: {
      evidenceIdsValid: true,
      unsafeHighRiskClaim: false,
      unsupportedCriticalToken: false,
      mcqUniqueAnswer: null
    },
    manualReview: {
      memoryAccepted: accepted,
      questionUsable: true,
      evidenceExplanationConsistent: true
    }
  };
}
