import assert from "node:assert/strict";
import test from "node:test";
import { createManualReviewCsv, parseManualReviewCsv } from "./report.js";

test("manual review CSV round trip parses booleans and quoted notes", () => {
  const csv = createManualReviewCsv({
    records: [{
      blindId: "abc",
      cohort: "web_feed",
      difficulty: "normal",
      reviewPreview: {
        disposition: "review",
        memoryStatement: "记忆点",
        questionType: "flashcard",
        questionPrompt: "问题",
        answer: "答案",
        citedEvidence: [{ id: "r001", text: "证据" }]
      }
    }]
  }).replace(/,,,,\n$/, ',true,false,true,"需要,复核"\n');
  assert.deepEqual(parseManualReviewCsv(csv), [{
    blindId: "abc",
    memoryAccepted: true,
    questionUsable: false,
    evidenceExplanationConsistent: true,
    notes: "需要,复核"
  }]);
});
