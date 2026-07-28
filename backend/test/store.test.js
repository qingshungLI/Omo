import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryCard } from "../src/cardService.js";
import { CardStore } from "../src/store.js";

test("creates an explicit demo card when Qwen is not configured", async () => {
  const previous = process.env.QWEN_API;
  delete process.env.QWEN_API;
  const card = await createMemoryCard({ imageBase64: "aGVsbG8=" });
  if (previous) process.env.QWEN_API = previous;

  assert.equal(card.rarity, "R");
  assert.equal(card.sourceTitle, "本地演示卡");
  assert.equal(card.masteryStage, "sealed");
});

test("stores cards and applies idempotent review feedback", () => {
  const store = new CardStore("");
  const card = {
    id: "card-1",
    coreKnowledge: "知识点",
    recallCue: "提示",
    answer: "答案",
    explanation: "解释",
    sourceTitle: "截图",
    rarity: "SR",
    createdAt: new Date().toISOString(),
    masteryStage: "sealed",
    nextReviewAt: new Date().toISOString(),
    reviewCount: 0,
    successfulRecallCount: 0,
    lastAssessment: null,
    stepIndex: 0,
    attemptIds: []
  };

  store.save("device-a", card);
  const first = store.assess("device-a", card.id, "remembered", "attempt-1");
  const repeated = store.assess("device-a", card.id, "forgot", "attempt-1");

  assert.equal(first.masteryStage, "awakened");
  assert.equal(first.reviewCount, 1);
  assert.equal(repeated.reviewCount, 1);
  assert.equal(repeated.lastAssessment, "remembered");
});
