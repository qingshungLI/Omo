import assert from "node:assert/strict";
import test from "node:test";

import {
  isCapturePersistenceStale,
  MemoryCaptureRepository,
  PostgresCaptureRepository
} from "./captureMemoryRepository.js";
import { createInitialReviewSchedule } from "./reviewSchedule.js";

const NOW = new Date("2026-07-24T08:00:00.000Z");
const IMAGE_SHA = "a".repeat(64);

function captureResult() {
  return {
    captureAnalysis: {
      schemaVersion: "capture_memory_card_2",
      disposition: "create_card",
      sourceStatus: "verified",
      sourceContext: {
        schemaVersion: "capture_source_context_1",
        nearbyText: "主动回忆能够暴露记忆缺口。",
        focusBlockIds: ["cited"],
        blocks: [{
          id: "cited",
          type: "subtitle",
          text: "主动回忆能够暴露记忆缺口。",
          sourceRole: "focus"
        }],
        overview: {
          summary: "主动回忆",
          highlights: ["主动回忆能够暴露记忆缺口。"]
        },
        completeness: "full"
      },
      memoryCard: {
        id: "generated-card",
        coreKnowledge: "主动回忆能够暴露记忆缺口。",
        recallCue: "主动回忆的直接作用是什么？",
        hiddenSemantic: "暴露记忆缺口",
        explanation: "先尝试提取信息。",
        sourceEvidenceIds: ["cited"],
        rarity: "R",
        rarityReason: "具体且局部的学习事实。",
        rarityConfidence: 0.9,
        rarityRuleVersion: "capture_rarity_2",
        recallVariants: []
      },
      schedule: createInitialReviewSchedule({ now: NOW })
    },
    source: {
      platform: "bilibili",
      url: "https://www.bilibili.com/video/BV1example",
      title: "主动回忆为什么有效"
    }
  };
}

function evidence() {
  return [
    { id: "cited", type: "subtitle", text: "主动回忆能够暴露记忆缺口。" },
    { id: "uncited", type: "subtitle", text: "不应被持久化的完整转写内容。" }
  ];
}

function confirmationResult() {
  return {
    captureAnalysis: {
      schemaVersion: "capture_memory_card_2",
      disposition: "needs_confirmation",
      sourceStatus: "unconfirmed",
      decisionReason: "需要用户确认核心知识。",
      memoryCards: [],
      memoryCard: null,
      schedules: [],
      schedule: null
    },
    memoryCard: {
      id: "pending-fragment",
      state: "fragment",
      coreKnowledge: "来源标题不是可验证知识",
      recallCue: "你想记住什么？",
      explanation: "需要用户确认核心知识。",
      sourceStatus: "unconfirmed"
    }
  };
}

function multiCardResult() {
  const first = captureResult().captureAnalysis.memoryCard;
  const second = {
    ...structuredClone(first),
    id: "generated-card-2",
    coreKnowledge: "间隔复习能把练习分散到不同时间。",
    recallCue: "间隔复习怎样安排练习？",
    hiddenSemantic: "分散到不同时间",
    explanation: "练习不是集中在一次完成。",
    sourceEvidenceIds: ["cited-2"]
  };
  const schedule = createInitialReviewSchedule({ now: NOW });
  return {
    ...captureResult(),
    captureAnalysis: {
      ...captureResult().captureAnalysis,
      memoryCards: [first, second],
      memoryCard: first,
      schedules: [
        { cardId: first.id, ...schedule },
        { cardId: second.id, ...schedule }
      ],
      schedule
    }
  };
}

class FakeRepositoryClient {
  constructor() {
    this.calls = [];
    this.card = null;
    this.epoch = "0";
  }

  async query(sql, params = []) {
    const text = String(sql).trim();
    this.calls.push({ text, params });
    if (text.startsWith("SELECT capture_persistence_epoch")) {
      return { rows: [{ capture_persistence_epoch: this.epoch }] };
    }
    if (text.startsWith("UPDATE devices") && text.includes("capture_persistence_epoch")) {
      this.epoch = (BigInt(this.epoch) + 1n).toString();
      const accountWide = text.includes("account_device_links");
      return {
        rows: accountWide
          ? [
              { id: "device-a", capture_persistence_epoch: this.epoch },
              { id: "device-b", capture_persistence_epoch: this.epoch }
            ]
          : [{ id: params[0], capture_persistence_epoch: this.epoch }],
        rowCount: accountWide ? 2 : 1
      };
    }
    if (text.startsWith("SELECT account_id FROM account_device_links")) return { rows: [] };
    if (text.startsWith("INSERT INTO captures")) return { rows: [{ id: params[0] }] };
    if (text.startsWith("DELETE FROM captures") && text.includes("account_id = $1")) {
      return { rows: [{ id: "capture-a" }, { id: "capture-b" }], rowCount: 2 };
    }
    if (text.startsWith("SELECT * FROM memory_cards") && text.includes("capture_id = $1")) {
      return { rows: this.card ? [this.card] : [] };
    }
    if (text.startsWith("INSERT INTO memory_cards")) {
      this.card = {
        id: params[0],
        capture_id: params[1],
        source_binding_id: params[2],
        device_id: params[3],
        account_id: params[4],
        disposition: params[5],
        state: params[6],
        card_json: JSON.parse(params[7]),
        source_evidence_ids_json: JSON.parse(params[8]),
        schedule_json: JSON.parse(params[9]),
        mastery_stage: "sealed",
        successful_recall_count: 0,
        review_count: 0,
        last_assessment: null,
        created_at: params[10],
        updated_at: params[11]
      };
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("SELECT * FROM memory_cards") && text.includes("device_id = $1")) {
      return { rows: this.card ? [this.card] : [] };
    }
    return { rows: [], rowCount: 0 };
  }

  release() {}
}

class DeleteRaceClient {
  constructor() {
    this.calls = [];
    this.epoch = "0";
    this.card = {
      id: "card-delete-race",
      capture_id: "capture-delete-race"
    };
  }

  async query(sql, params = []) {
    const text = String(sql).trim();
    this.calls.push({ text, params });
    if (text.startsWith("SELECT capture_persistence_epoch")) {
      return { rows: [{ capture_persistence_epoch: this.epoch }] };
    }
    if (text.startsWith("UPDATE devices") && text.includes("capture_persistence_epoch")) {
      this.epoch = (BigInt(this.epoch) + 1n).toString();
      return {
        rows: [{ id: params[0], capture_persistence_epoch: this.epoch }],
        rowCount: 1
      };
    }
    if (text.startsWith("SELECT capture_id FROM memory_cards")) {
      return { rows: this.card ? [{ capture_id: this.card.capture_id }] : [] };
    }
    if (text.startsWith("DELETE FROM memory_cards")) {
      this.card = null;
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("SELECT 1 FROM memory_cards")) return { rows: [] };
    return { rows: [], rowCount: 0 };
  }

  release() {}
}

test("Postgres repository awaits one transaction and persists only cited evidence", async () => {
  const client = new FakeRepositoryClient();
  const repository = new PostgresCaptureRepository({ connect: async () => client });
  const persistenceEpoch = await repository.beginPersistence("device-a");
  client.calls = [];
  const stored = await repository.persistCaptureResult("device-a", captureResult(), {
    now: NOW,
    imageSha256: IMAGE_SHA,
    persistenceEpoch,
    evidence: evidence()
  });

  assert.equal(stored.durable, true);
  assert.equal(stored.disposition, "create_card");
  assert.equal(stored.masteryStage, "sealed");
  assert.equal(stored.sourceContext.nearbyText, "主动回忆能够暴露记忆缺口。");
  const evidenceInserts = client.calls.filter((call) => call.text.startsWith("INSERT INTO evidence_regions"));
  assert.equal(evidenceInserts.length, 1);
  assert.equal(evidenceInserts[0].params[2], "cited");
  assert.equal(evidenceInserts[0].params[4], "主动回忆能够暴露记忆缺口。");
  assert.equal(client.calls.at(-1).text, "COMMIT");
  assert.equal(client.calls.some((call) => call.params.includes("不应被持久化的完整转写内容。")), false);
});

test("Postgres repository rejects a stale epoch before inserting a capture", async () => {
  const client = new FakeRepositoryClient();
  const repository = new PostgresCaptureRepository({ connect: async () => client });
  const persistenceEpoch = await repository.beginPersistence("device-a");
  await repository.clearDevice("device-a");
  assert.equal(client.epoch, "1");
  client.calls = [];

  const stored = await repository.persistCaptureResult("device-a", captureResult(), {
    now: NOW,
    imageSha256: IMAGE_SHA,
    persistenceEpoch,
    evidence: evidence()
  });

  assert.equal(isCapturePersistenceStale(stored), true);
  assert.equal(stored.persisted, false);
  assert.equal(client.calls.some((call) => call.text.startsWith("INSERT INTO captures")), false);
  assert.equal(client.calls.at(-1).text, "ROLLBACK");
});

test("Postgres single-card deletion fences an in-flight persist with device-first locks", async () => {
  const client = new DeleteRaceClient();
  const repository = new PostgresCaptureRepository({ connect: async () => client });
  const persistenceEpoch = await repository.beginPersistence("device-delete-race");
  const deletionStart = client.calls.length;

  const deleted = await repository.deleteCard("device-delete-race", "card-delete-race", {
    now: NOW
  });

  const deletionCalls = client.calls.slice(deletionStart);
  const preflightIndex = deletionCalls.findIndex((call) =>
    call.text.startsWith("SELECT capture_id FROM memory_cards") && !call.text.includes("FOR UPDATE")
  );
  const deviceLockIndex = deletionCalls.findIndex((call) =>
    call.text.startsWith("INSERT INTO devices")
  );
  const epochIndex = deletionCalls.findIndex((call) =>
    call.text.startsWith("UPDATE devices") && call.text.includes("capture_persistence_epoch")
  );
  const cardLockIndex = deletionCalls.findIndex((call) =>
    call.text.startsWith("SELECT capture_id FROM memory_cards") && call.text.includes("FOR UPDATE")
  );
  const deleteIndex = deletionCalls.findIndex((call) =>
    call.text.startsWith("DELETE FROM memory_cards")
  );
  assert.equal(deleted.cardId, "card-delete-race");
  assert.equal(client.epoch, "1");
  assert.equal(preflightIndex > -1, true);
  assert.equal(deviceLockIndex > preflightIndex, true);
  assert.equal(epochIndex > deviceLockIndex, true);
  assert.equal(cardLockIndex > epochIndex, true);
  assert.equal(deleteIndex > cardLockIndex, true);

  const stored = await repository.persistCaptureResult("device-delete-race", captureResult(), {
    now: new Date("2026-07-24T08:01:00.000Z"),
    imageSha256: IMAGE_SHA,
    persistenceEpoch,
    evidence: evidence()
  });
  assert.equal(isCapturePersistenceStale(stored), true);
  assert.equal(client.calls.some((call) => call.text.startsWith("INSERT INTO captures")), false);
});

test("Postgres account deletion fence covers multiple devices before deleting captures", async () => {
  const client = new FakeRepositoryClient();
  const repository = new PostgresCaptureRepository({ connect: async () => client });
  const count = await repository.clearAccount("account-a", { requestedDeviceId: "device-a" });

  assert.equal(count, 2);
  const bumpIndex = client.calls.findIndex((call) =>
    call.text.startsWith("UPDATE devices") && call.text.includes("account_device_links")
  );
  const deleteIndex = client.calls.findIndex((call) =>
    call.text.startsWith("DELETE FROM captures") && call.text.includes("account_id = $1")
  );
  assert.equal(bumpIndex > -1, true);
  assert.equal(deleteIndex > bumpIndex, true);
  assert.deepEqual(client.calls[bumpIndex].params, ["account-a", "device-a"]);
  assert.equal(client.calls.at(-1).text, "COMMIT");
});

test("memory deletion keeps an epoch tombstone and blocks the old task", () => {
  const repository = new MemoryCaptureRepository();
  const persistenceEpoch = repository.beginPersistence("device-a");
  repository.clearDevice("device-a");
  const stored = repository.persistCaptureResult("device-a", captureResult(), {
    now: NOW,
    imageSha256: IMAGE_SHA,
    persistenceEpoch,
    evidence: evidence()
  });

  assert.equal(isCapturePersistenceStale(stored), true);
  assert.equal(repository.list("device-a").cards.length, 0);
  assert.equal(repository.beginPersistence("device-a").epoch, "1");
});

test("single-card deletion blocks an in-flight persist from restoring the card", () => {
  const repository = new MemoryCaptureRepository();
  const original = repository.persistCaptureResult("device-delete-race", captureResult(), {
    now: NOW,
    imageSha256: IMAGE_SHA,
    evidence: evidence()
  });
  const persistenceEpoch = repository.beginPersistence("device-delete-race");
  const deleted = repository.deleteCard("device-delete-race", original.id, { now: NOW });

  const stored = repository.persistCaptureResult("device-delete-race", captureResult(), {
    now: new Date("2026-07-24T08:01:00.000Z"),
    imageSha256: IMAGE_SHA,
    persistenceEpoch,
    evidence: evidence()
  });

  assert.equal(deleted.cardId, original.id);
  assert.equal(repository.beginPersistence("device-delete-race").epoch, "1");
  assert.equal(isCapturePersistenceStale(stored), true);
  assert.equal(repository.list("device-delete-race").cards.length, 0);
});

test("memory repository is idempotent by image hash and never downgrades a formal card", async () => {
  const repository = new MemoryCaptureRepository();
  const first = await repository.persistCaptureResult("device-a", captureResult(), {
    now: NOW,
    imageSha256: IMAGE_SHA,
    evidence: evidence()
  });
  const second = await repository.persistCaptureResult("device-a", captureResult(), {
    now: new Date("2026-07-25T08:00:00.000Z"),
    imageSha256: IMAGE_SHA,
    evidence: evidence()
  });
  const attemptedDowngrade = await repository.persistCaptureResult("device-a", {
    captureAnalysis: {
      schemaVersion: "capture_memory_card_2",
      disposition: "needs_confirmation",
      sourceStatus: "unconfirmed",
      decisionReason: "后续识别缺少上下文。",
      memoryCard: null,
      schedule: null
    }
  }, {
    now: new Date("2026-07-26T08:00:00.000Z"),
    imageSha256: IMAGE_SHA,
    evidence: []
  });

  assert.equal(second.captureId, first.captureId);
  assert.equal(second.id, first.id);
  assert.equal(attemptedDowngrade.disposition, "create_card");
  assert.equal(attemptedDowngrade.schedule.nextReviewAt, first.schedule.nextReviewAt);
  assert.equal((await repository.list("device-a")).cards.length, 1);
});

test("confirmation promotes only an evidence substring without rerunning capture analysis", () => {
  const repository = new MemoryCaptureRepository();
  const pending = repository.persistCaptureResult("confirmation-device", confirmationResult(), {
    now: NOW,
    imageSha256: "9".repeat(64),
    evidence: evidence()
  });
  const missingInput = repository.resolveConfirmation(
    "confirmation-device",
    pending.id,
    { action: "confirm" },
    { now: NOW }
  );
  assert.equal(missingInput.status, "needs_user_input");
  assert.deepEqual(missingInput.requiredFields, ["coreKnowledge"]);
  assert.deepEqual(missingInput.evidence, [{
    id: "cited",
    text: "主动回忆能够暴露记忆缺口。"
  }]);
  assert.equal(repository.get("confirmation-device", pending.id).state, "fragment");

  const rejected = repository.resolveConfirmation(
    "confirmation-device",
    pending.id,
    {
      action: "confirm",
      coreKnowledge: "主动回忆可以保证永远不会忘记。"
    },
    { now: NOW }
  );
  assert.equal(rejected.status, "needs_user_input");
  assert.equal(repository.get("confirmation-device", pending.id).state, "fragment");

  const confirmed = repository.resolveConfirmation(
    "confirmation-device",
    pending.id,
    {
      action: "confirm",
      coreKnowledge: "主动回忆能够暴露记忆缺口。",
      hiddenSemantic: "暴露记忆缺口"
    },
    { now: NOW }
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.repeated, false);
  assert.equal(confirmed.card.id, pending.id);
  assert.equal(confirmed.card.state, "formal");
  assert.equal(confirmed.card.disposition, "create_card");
  assert.equal(confirmed.card.sourceStatus, "partial");
  assert.equal(confirmed.card.hiddenSemantic, "暴露记忆缺口");
  assert.deepEqual(confirmed.card.sourceEvidenceIds, ["cited"]);
  assert.equal(confirmed.card.recallVariants.length, 3);
  assert.equal(confirmed.card.schedule.intervalDays, 0);

  const repeated = repository.resolveConfirmation(
    "confirmation-device",
    pending.id,
    { action: "confirm" },
    { now: NOW }
  );
  assert.equal(repeated.status, "confirmed");
  assert.equal(repeated.repeated, true);
  assert.equal(repository.list("confirmation-device").cards[0].state, "formal");
});

test("confirmation archive keeps the fragment and cannot archive a formal card", () => {
  const repository = new MemoryCaptureRepository();
  const pending = repository.persistCaptureResult("archive-device", confirmationResult(), {
    now: NOW,
    imageSha256: "8".repeat(64),
    evidence: evidence()
  });
  const archived = repository.resolveConfirmation(
    "archive-device",
    pending.id,
    { action: "archive" },
    { now: NOW }
  );
  assert.equal(archived.status, "archived");
  assert.equal(archived.card.disposition, "archive_only");
  assert.equal(archived.card.state, "fragment");
  assert.equal(archived.card.schedule, null);
  const repeated = repository.resolveConfirmation(
    "archive-device",
    pending.id,
    { action: "archive" },
    { now: NOW }
  );
  assert.equal(repeated.repeated, true);

  const formal = repository.persistCaptureResult("formal-device", captureResult(), {
    now: NOW,
    imageSha256: "7".repeat(64),
    evidence: evidence()
  });
  assert.throws(
    () => repository.resolveConfirmation(
      "formal-device",
      formal.id,
      { action: "archive" },
      { now: NOW }
    ),
    (error) => error.code === "capture_memory_confirmation_conflict"
      && error.statusCode === 409
  );
});

test("memory repository persists, schedules, assesses, and deletes sibling cards independently", () => {
  const repository = new MemoryCaptureRepository();
  const stored = repository.persistCaptureResult("device-multi", multiCardResult(), {
    now: NOW,
    imageSha256: "f".repeat(64),
    evidence: [
      ...evidence(),
      { id: "cited-2", type: "subtitle", text: "间隔复习能把练习分散到不同时间。" }
    ]
  });
  assert.equal(stored.memoryCards.length, 2);
  assert.equal(stored.memoryCard.id, stored.memoryCards[0].id);
  assert.equal(stored.schedules.length, 2);
  assert.deepEqual(stored.memoryCards[0].captureGroup, {
    captureId: stored.captureId,
    cardIds: stored.memoryCards.map((card) => card.id),
    count: 2,
    index: 0
  });
  assert.equal(repository.list("device-multi").cards[1].captureGroup.count, 2);
  assert.equal(repository.list("device-multi").cards[1].captureGroup.index, 1);
  const [first, second] = stored.memoryCards;

  const firstAssessment = repository.recordAssessment("device-multi", first.id, {
    attemptId: "first-attempt",
    assessment: "remembered"
  }, { now: NOW });
  assert.equal(firstAssessment.schedule.intervalDays, 1);
  assert.equal(repository.get("device-multi", second.id).schedule.intervalDays, 0);

  const regenerated = multiCardResult();
  regenerated.captureAnalysis.memoryCards.reverse();
  regenerated.captureAnalysis.schedules.reverse();
  regenerated.captureAnalysis.memoryCards[0].coreKnowledge = "模型重试给出的不同内容不应覆盖既有卡。";
  regenerated.captureAnalysis.memoryCard = regenerated.captureAnalysis.memoryCards[0];
  const repeated = repository.persistCaptureResult("device-multi", regenerated, {
    now: new Date("2026-07-25T08:00:00.000Z"),
    imageSha256: "f".repeat(64),
    evidence: [
      ...evidence(),
      { id: "cited-2", type: "subtitle", text: "间隔复习能把练习分散到不同时间。" }
    ]
  });
  assert.deepEqual(repeated.memoryCards.map((card) => card.id), [first.id, second.id]);
  assert.equal(repeated.memoryCards[0].coreKnowledge, first.coreKnowledge);
  assert.equal(repeated.memoryCards[0].schedule.intervalDays, 1);
  assert.equal(repeated.memoryCards[0].masteryStage, "awakened");
  assert.equal(repeated.memoryCards[1].schedule.intervalDays, 0);
  assert.equal(repeated.memoryCards.length, 2);

  const deletedFirst = repository.deleteCard("device-multi", first.id, { now: NOW });
  assert.equal(deletedFirst.captureId, second.captureId);
  const [remaining] = repository.list("device-multi").cards;
  assert.deepEqual(remaining.captureGroup, {
    captureId: second.captureId,
    cardIds: [second.id],
    count: 1,
    index: 0
  });
  assert.equal(repository.get("device-multi", second.id).id, second.id);
  const duplicateAfterDeletion = repository.persistCaptureResult("device-multi", multiCardResult(), {
    now: new Date("2026-07-26T08:00:00.000Z"),
    imageSha256: "f".repeat(64),
    evidence: [
      ...evidence(),
      { id: "cited-2", type: "subtitle", text: "间隔复习能把练习分散到不同时间。" }
    ]
  });
  assert.deepEqual(duplicateAfterDeletion.memoryCards.map((card) => card.id), [second.id]);

  repository.deleteCard("device-multi", second.id, { now: NOW });
  assert.equal(repository.list("device-multi").cards.length, 0);
});

test("Postgres list derives stable group order from persisted ordinals even when row order changes", async () => {
  const schedule = createInitialReviewSchedule({ now: NOW });
  const row = (id, index) => ({
    id,
    capture_id: "capture-stable",
    device_id: "device-stable",
    disposition: "create_card",
    state: "formal",
    card_json: {
      id,
      captureGroupIndex: index,
      coreKnowledge: `知识 ${index + 1}`
    },
    schedule_json: schedule,
    mastery_stage: "sealed",
    successful_recall_count: 0,
    review_count: 0,
    last_assessment: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString()
  });
  const rows = [row("card-b", 1), row("card-a", 0)];
  let calls = 0;
  const repository = new PostgresCaptureRepository({
    query: async () => {
      calls += 1;
      return { rows: calls % 2 === 1 ? rows : [...rows].reverse() };
    }
  });
  const first = await repository.list("device-stable", { now: NOW });
  const second = await repository.list("device-stable", { now: NOW });
  for (const response of [first, second]) {
    assert.deepEqual(
      response.cards.find((card) => card.id === "card-a").captureGroup,
      {
        captureId: "capture-stable",
        cardIds: ["card-a", "card-b"],
        count: 2,
        index: 0
      }
    );
    assert.equal(response.cards.find((card) => card.id === "card-b").captureGroup.index, 1);
  }
});
