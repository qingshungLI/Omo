import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCaptureAnalysisInput,
  validateCaptureAnalysisOutput
} from "./contracts.js";
import { validCaptureInput, validCaptureOutput } from "./testFixtures.js";

test("valid CaptureAnalysis input and output pass", () => {
  const input = validCaptureInput();
  assert.deepEqual(validateCaptureAnalysisInput(input), []);
  assert.deepEqual(
    validateCaptureAnalysisOutput(validCaptureOutput(), { allowedEvidenceIds: ["r001"] }),
    []
  );
});

test("unknown Evidence ID is rejected", () => {
  const output = validCaptureOutput({
    memoryItem: { evidenceRegionIds: ["invented"] },
    question: { evidenceRegionIds: ["invented"] }
  });
  const issues = validateCaptureAnalysisOutput(output, { allowedEvidenceIds: ["r001"] });
  assert.equal(issues.some((issue) => issue.code === "evidence_unknown_id"), true);
});

test("image input requires explicit cloud consent", () => {
  const input = validCaptureInput({
    image: {
      path: "/tmp/example.png",
      mimeType: "image/png",
      consentToCloudAnalysis: false
    }
  });
  assert.equal(
    validateCaptureAnalysisInput(input).some((issue) => issue.code === "privacy_image_consent"),
    true
  );
});

test("direct image input may omit OCR regions", () => {
  const input = validCaptureInput({
    ocrRegions: [],
    image: {
      path: "/tmp/example.png",
      mimeType: "image/png",
      consentToCloudAnalysis: true
    }
  });
  assert.deepEqual(validateCaptureAnalysisInput(input), []);
});

test("visual output may define and cite its own evidence regions", () => {
  const output = validCaptureOutput({
    evidenceRegions: [{
      id: "v001",
      text: "主动回忆",
      confidence: 0.98,
      boundingBox: [0.1, 0.1, 0.5, 0.1]
    }],
    memoryItem: { evidenceRegionIds: ["v001"] },
    question: { evidenceRegionIds: ["v001"] }
  });
  assert.deepEqual(validateCaptureAnalysisOutput(output, { allowedEvidenceIds: [] }), []);
});

test("archive_only cannot carry a memory item or question", () => {
  const issues = validateCaptureAnalysisOutput(
    validCaptureOutput({ disposition: "archive_only" }),
    { allowedEvidenceIds: ["r001"] }
  );
  assert.equal(issues.some((issue) => issue.code === "schema_memory_forbidden"), true);
  assert.equal(issues.some((issue) => issue.code === "schema_question_forbidden"), true);
});
