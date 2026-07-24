import assert from "node:assert/strict";
import test from "node:test";

import { captureMemoryStore } from "./captureMemoryStore.js";
import { createInitialReviewSchedule } from "./reviewSchedule.js";
import { server } from "../server.js";

test("lists device-isolated cards and records idempotent assessments over HTTP", async (t) => {
  captureMemoryStore.reset();
  captureMemoryStore.upsertCaptureAnalysis("route-device", {
    schemaVersion: "capture_memory_card_2",
    disposition: "create_card",
    sourceStatus: "verified",
    memoryCard: {
      id: "route-card",
      coreKnowledge: "主动回忆能够暴露记忆缺口。",
      recallCue: "主动回忆有什么作用？",
      hiddenSemantic: "暴露记忆缺口",
      explanation: "先尝试提取信息。",
      sourceEvidenceIds: ["e-1"],
      rarity: "R",
      rarityReason: "局部学习方法。",
      rarityConfidence: 0.8,
      rarityRuleVersion: "capture_rarity_2",
      recallVariants: []
    },
    schedule: createInitialReviewSchedule({
      now: new Date("2026-07-24T08:00:00.000Z")
    })
  }, {
    now: new Date("2026-07-24T08:00:00.000Z")
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    captureMemoryStore.reset();
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "content-type": "application/json",
    "x-device-id": "route-device"
  };

  const listResponse = await fetch(`${baseUrl}/api/memory-cards`, { headers });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.schemaVersion, "capture_memory_cards_1");
  assert.deepEqual(list.cards.map((card) => card.id), ["route-card"]);

  const firstResponse = await fetch(
    `${baseUrl}/api/memory-cards/route-card/assessments`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        attemptId: "route-attempt",
        assessment: "remembered"
      })
    }
  );
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.schedule.intervalDays, 1);
  assert.equal(first.assessment.repeated, false);

  const repeatedResponse = await fetch(
    `${baseUrl}/api/memory-cards/route-card/assessments`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        attemptId: "route-attempt",
        assessment: "forgot"
      })
    }
  );
  const repeated = await repeatedResponse.json();
  assert.equal(repeated.assessment.repeated, true);
  assert.equal(repeated.assessment.assessment, "remembered");
  assert.equal(repeated.schedule.intervalDays, 1);

  const otherDeviceResponse = await fetch(`${baseUrl}/api/memory-cards`, {
    headers: { ...headers, "x-device-id": "other-device" }
  });
  const otherDevice = await otherDeviceResponse.json();
  assert.deepEqual(otherDevice.cards, []);
});
