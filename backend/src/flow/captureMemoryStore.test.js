import assert from "node:assert/strict";
import test from "node:test";

import { CaptureMemoryStore } from "./captureMemoryStore.js";
import { createInitialReviewSchedule } from "./reviewSchedule.js";

const NOW = new Date("2026-07-24T08:00:00.000Z");

function analysis(id = "capture-1") {
  return {
    schemaVersion: "capture_memory_card_2",
    disposition: "create_card",
    sourceStatus: "partial",
    memoryCard: {
      id,
      coreKnowledge: "主动回忆能够暴露记忆缺口。",
      recallCue: "主动回忆的直接作用是什么？",
      hiddenSemantic: "暴露记忆缺口",
      explanation: "主动回忆要求先尝试提取信息。",
      sourceEvidenceIds: ["e-1"],
      rarity: "R",
      rarityReason: "具体学习策略。",
      rarityConfidence: 0.8,
      rarityRuleVersion: "capture_rarity_2",
      recallVariants: []
    },
    schedule: createInitialReviewSchedule({ now: NOW })
  };
}

test("stores only create_card results and isolates devices", () => {
  const store = new CaptureMemoryStore();
  assert.equal(store.upsertCaptureAnalysis("a", {
    ...analysis(),
    disposition: "needs_confirmation",
    memoryCard: null
  }, { now: NOW }), null);

  store.upsertCaptureAnalysis("a", analysis("card-a"), { now: NOW });
  store.upsertCaptureAnalysis("b", analysis("card-b"), { now: NOW });
  assert.deepEqual(store.list("a", { now: NOW }).cards.map((card) => card.id), ["card-a"]);
  assert.deepEqual(store.list("b", { now: NOW }).cards.map((card) => card.id), ["card-b"]);
  assert.equal(store.get("b", "card-a"), null);
});

test("records assessments idempotently without advancing twice", () => {
  const store = new CaptureMemoryStore();
  store.upsertCaptureAnalysis("device-a", analysis(), { now: NOW });

  const first = store.recordAssessment("device-a", "capture-1", {
    attemptId: "stable-attempt-1",
    assessment: "remembered"
  }, { now: NOW });
  const repeated = store.recordAssessment("device-a", "capture-1", {
    attemptId: "stable-attempt-1",
    assessment: "forgot"
  }, { now: new Date("2026-07-25T08:00:00.000Z") });

  assert.equal(first.assessment.repeated, false);
  assert.equal(first.schedule.intervalDays, 1);
  assert.equal(repeated.assessment.repeated, true);
  assert.equal(repeated.assessment.assessment, "remembered");
  assert.deepEqual(repeated.schedule, first.schedule);
  assert.equal(store.get("device-a", "capture-1").schedule.intervalDays, 1);
});

test("filters due, fading, and time capsule pools from real state", () => {
  const store = new CaptureMemoryStore();
  const old = new Date("2026-06-01T08:00:00.000Z");
  store.upsertCaptureAnalysis("device-a", analysis("old-card"), { now: old });
  store.upsertCaptureAnalysis("device-a", analysis("new-card"), { now: NOW });
  store.recordAssessment("device-a", "new-card", {
    attemptId: "fuzzy-1",
    assessment: "fuzzy"
  }, { now: NOW });

  assert.deepEqual(
    store.list("device-a", { pool: "fading", now: NOW }).cards.map((card) => card.id),
    ["new-card"]
  );
  assert.deepEqual(
    store.list("device-a", { pool: "time_capsule", now: NOW }).cards.map((card) => card.id),
    ["old-card"]
  );
  assert.deepEqual(
    store.list("device-a", { pool: "due", now: NOW }).cards.map((card) => card.id),
    ["old-card"]
  );
});

test("rejects malformed assessment requests", () => {
  const store = new CaptureMemoryStore();
  store.upsertCaptureAnalysis("device-a", analysis(), { now: NOW });
  assert.throws(
    () => store.recordAssessment("device-a", "capture-1", {
      attemptId: "",
      assessment: "remembered"
    }),
    /attemptId 不能为空/
  );
  assert.throws(
    () => store.recordAssessment("device-a", "capture-1", {
      attemptId: "attempt",
      assessment: "easy"
    }),
    /remembered、fuzzy 或 forgot/
  );
});
