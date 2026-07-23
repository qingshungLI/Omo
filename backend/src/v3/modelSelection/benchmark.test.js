import assert from "node:assert/strict";
import test from "node:test";
import { runModelSelectionBenchmark } from "./benchmark.js";
import { validCaptureOutput, validSyntheticSample } from "./testFixtures.js";

const candidate = {
  id: "test-text",
  provider: "qwen",
  model: "test",
  mode: "text",
  productionEligibleMainland: true,
  pricing: {
    currency: "CNY",
    inputPerMillion: 1,
    outputPerMillion: 2
  }
};

test("benchmark stores metrics and review preview but not full response", async () => {
  const dataset = {
    datasetId: "test",
    samples: [validSyntheticSample()],
    validation: { validForDevelopment: true, readyForSelection: false }
  };
  const result = await runModelSelectionBenchmark({
    dataset,
    candidates: [candidate],
    phase: "text",
    callCandidate: async () => ({
      data: validCaptureOutput(),
      usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50 },
      latencyMs: 100,
      rawHash: "raw"
    })
  });
  const record = result.records[0];
  assert.equal(record.status, "passed_quality_gate");
  assert.equal(record.reviewPreview.memoryStatement.length > 0, true);
  assert.equal("data" in record, false);
  assert.equal(JSON.stringify(record).includes("raw"), false);
});

test("schema repair happens at most once", async () => {
  let calls = 0;
  const dataset = {
    datasetId: "test",
    samples: [validSyntheticSample()],
    validation: { validForDevelopment: true, readyForSelection: false }
  };
  const result = await runModelSelectionBenchmark({
    dataset,
    candidates: [candidate],
    phase: "text",
    callCandidate: async () => {
      calls += 1;
      return {
        data: calls === 1 ? { schemaVersion: "bad" } : validCaptureOutput(),
        usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 },
        latencyMs: 10
      };
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.records[0].firstSchemaPassed, false);
  assert.equal(result.records[0].afterRepairSchemaPassed, true);
});

test("direct vision output must quote evidence found in independent golden text", async () => {
  const sample = validSyntheticSample({
    input: {
      image: {
        path: "/tmp/not-read-by-injected-caller.png",
        mimeType: "image/png",
        consentToCloudAnalysis: true
      }
    }
  });
  const dataset = {
    datasetId: "test",
    samples: [sample],
    validation: { validForDevelopment: true, readyForSelection: false }
  };
  const visionCandidate = { ...candidate, id: "test-vision", mode: "vision" };
  const result = await runModelSelectionBenchmark({
    dataset,
    candidates: [visionCandidate],
    phase: "vision",
    callCandidate: async () => ({
      data: validCaptureOutput({
        evidenceRegions: [{
          id: "v001",
          text: "人工真值中不存在的内容",
          confidence: 0.99,
          boundingBox: [0.1, 0.1, 0.8, 0.1]
        }],
        memoryItem: { evidenceRegionIds: ["v001"] },
        question: { evidenceRegionIds: ["v001"] }
      }),
      usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50 },
      latencyMs: 100
    })
  });
  assert.equal(result.records[0].status, "quality_reject");
  assert.equal(
    result.records[0].quality.findingCodes.includes("visual_evidence_not_in_golden"),
    true
  );
});
