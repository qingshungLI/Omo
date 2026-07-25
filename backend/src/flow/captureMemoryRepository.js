import { createHash, randomUUID } from "node:crypto";

import {
  databasePool,
  hasDatabase,
  incrementCapturePersistenceEpochForDevice,
  incrementCapturePersistenceEpochsForAccount
} from "../db.js";
import {
  CAPTURE_RARITY_RULE_VERSION,
  validateCaptureMemoryOutput
} from "./captureMemoryCard.js";
import {
  advanceReviewSchedule,
  createInitialReviewSchedule,
  normalizeReviewSchedule,
  REVIEW_ASSESSMENTS
} from "./reviewSchedule.js";

export const CAPTURE_MEMORY_CARDS_SCHEMA_VERSION = "capture_memory_cards_1";
export const CAPTURE_MEMORY_ASSESSMENT_SCHEMA_VERSION = "capture_memory_assessment_1";
export const CAPTURE_MEMORY_DELETION_SCHEMA_VERSION = "capture_memory_card_deletion_1";
export const CAPTURE_MEMORY_CONFIRMATION_SCHEMA_VERSION = "capture_memory_confirmation_1";
export const CAPTURE_PERSISTENCE_EPOCH_SCHEMA_VERSION = "capture_persistence_epoch_1";
export const CAPTURE_PERSISTENCE_STALE_SCHEMA_VERSION = "capture_persistence_stale_1";
export const MASTERY_STAGES = Object.freeze(["sealed", "awakened", "solidified", "engraved"]);

export class MemoryCaptureRepository {
  durable = false;
  #cardsByDeviceId = new Map();
  #captureIdsByDeviceHash = new Map();
  #persistenceEpochByDeviceId = new Map();

  beginPersistence(deviceId) {
    const ownerId = requiredText(deviceId, "deviceId");
    return serializePersistenceEpoch(
      ownerId,
      this.#currentPersistenceEpoch(ownerId),
      this.durable
    );
  }

  persistCaptureResult(deviceId, result, options = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const expectedEpoch = expectedPersistenceEpoch(options.persistenceEpoch, ownerId);
    const currentEpoch = this.#currentPersistenceEpoch(ownerId);
    if (expectedEpoch !== null && expectedEpoch !== currentEpoch) {
      return serializeStalePersistence(this.durable);
    }
    const normalized = normalizeCapturePersistence(result, options);
    if (!normalized) return null;
    const cards = this.#deviceCards(ownerId);
    const hashKey = `${ownerId}:${normalized.imageSha256}`;
    const previousCaptureId = this.#captureIdsByDeviceHash.get(hashKey);
    const existingEntries = previousCaptureId
      ? [...cards.values()].filter((entry) => entry.captureId === previousCaptureId)
      : [];
    if (existingEntries.some((entry) => entry.state === "formal")) {
      return serializeCaptureGroup(existingEntries, { durable: this.durable });
    }

    const captureId = existingEntries[0]?.captureId || `capture-${randomUUID()}`;
    const date = normalized.now;
    const nextEntries = normalized.memoryCards.map((candidate, index) => {
      const cardId = options.preserveCardId
        ? candidate.id
        : stableCardId(captureId, candidate.id);
      const existing = existingEntries.find((entry) => entry.memoryCard.id === cardId);
      const createdAt = existing?.createdAt || date.toISOString();
      const memoryCard = {
        ...structuredClone(candidate),
        id: cardId,
        captureId,
        captureGroupIndex: index,
        state: normalized.state === "formal" ? "formal" : "fragment",
        sourceStatus: normalized.sourceStatus,
        createdAt,
        updatedAt: date.toISOString()
      };
      return {
        captureId,
        imageSha256: normalized.imageSha256,
        disposition: normalized.disposition,
        state: normalized.state,
        sourceStatus: normalized.sourceStatus,
        memoryCard,
        evidence: structuredClone(normalized.evidence),
        sourceBinding: structuredClone(normalized.sourceBinding),
        schedule: normalized.state === "formal"
          ? existing?.schedule || normalized.schedules[index]
          : null,
        masteryStage: existing?.masteryStage || "sealed",
        successfulRecallCount: existing?.successfulRecallCount || 0,
        reviewCount: existing?.reviewCount || 0,
        lastAssessment: existing?.lastAssessment || null,
        attemptsById: existing?.attemptsById || new Map(),
        createdAt,
        updatedAt: date.toISOString()
      };
    });
    const nextIds = new Set(nextEntries.map((entry) => entry.memoryCard.id));
    for (const existing of existingEntries) {
      if (!nextIds.has(existing.memoryCard.id)) cards.delete(existing.memoryCard.id);
    }
    for (const entry of nextEntries) cards.set(entry.memoryCard.id, entry);
    this.#captureIdsByDeviceHash.set(hashKey, captureId);
    return serializeCaptureGroup(nextEntries, { durable: this.durable });
  }

  upsertCaptureAnalysis(deviceId, captureAnalysis, { now = new Date() } = {}) {
    const analysisCards = Array.isArray(captureAnalysis?.memoryCards)
      ? captureAnalysis.memoryCards
      : captureAnalysis?.memoryCard ? [captureAnalysis.memoryCard] : [];
    const ids = uniqueStrings(analysisCards.flatMap((card) => card?.sourceEvidenceIds || []));
    return this.persistCaptureResult(deviceId, {
      captureAnalysis,
      memoryCard: captureAnalysis?.memoryCard
    }, {
      now,
      imageSha256: fallbackImageHash(
        deviceId,
        analysisCards[0]?.id,
        captureAnalysis?.disposition,
        captureAnalysis?.decisionReason
      ),
      evidence: ids.map((id) => ({
        id,
        type: "paragraph",
        text: analysisCards.find((card) => card?.sourceEvidenceIds?.includes(id))?.coreKnowledge
          || "兼容记忆卡证据"
      })),
      preserveCardId: true
    });
  }

  list(deviceId, options = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const date = normalizeDate(options.now || new Date());
    const cards = attachCaptureGroupMetadata(
      [...(this.#cardsByDeviceId.get(ownerId)?.values() || [])]
        .map((entry) => serializeEntry(entry, { durable: this.durable }))
    )
      .filter((card) => matchesPool(entryForPool(card), options.pool, date, options.timeCapsuleDays))
      .sort(compareSerializedEntries);
    return {
      schemaVersion: CAPTURE_MEMORY_CARDS_SCHEMA_VERSION,
      durable: this.durable,
      cards
    };
  }

  get(deviceId, cardId) {
    const ownerId = requiredText(deviceId, "deviceId");
    const stableCardId = requiredText(cardId, "cardId");
    const entry = this.#cardsByDeviceId.get(ownerId)?.get(stableCardId);
    return entry ? serializeEntry(entry, { durable: this.durable }) : null;
  }

  resolveConfirmation(deviceId, cardId, input = {}, { now = new Date() } = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const stableCardId = requiredText(cardId, "cardId");
    const request = normalizeConfirmationRequest(input);
    const entry = this.#cardsByDeviceId.get(ownerId)?.get(stableCardId);
    if (!entry) return null;
    const date = normalizeDate(now);

    if (request.action === "archive") {
      if (entry.disposition === "archive_only") {
        return serializeConfirmation("archived", entry, {
          durable: this.durable,
          repeated: true
        });
      }
      if (entry.state === "formal") {
        throw confirmationConflict("正式记忆卡不能通过待确认接口归档。");
      }
      entry.disposition = "archive_only";
      entry.state = "fragment";
      entry.memoryCard = {
        ...entry.memoryCard,
        state: "fragment",
        updatedAt: date.toISOString()
      };
      entry.schedule = null;
      entry.updatedAt = date.toISOString();
      return serializeConfirmation("archived", entry, { durable: this.durable });
    }

    if (entry.state === "formal") {
      return serializeConfirmation("confirmed", entry, {
        durable: this.durable,
        repeated: true
      });
    }
    if (entry.disposition !== "needs_confirmation") {
      throw confirmationConflict("只有待确认的记忆片段可以确认。");
    }
    const outcome = buildConfirmedCard({
      cardId: stableCardId,
      existingCard: entry.memoryCard,
      evidence: entry.evidence,
      sourceStatus: entry.sourceStatus,
      request,
      now: date
    });
    if (outcome.status === "needs_user_input") {
      return serializeNeedsUserInput(stableCardId, entry.evidence, outcome);
    }
    entry.disposition = "create_card";
    entry.state = "formal";
    entry.sourceStatus = outcome.sourceStatus;
    entry.memoryCard = {
      ...outcome.card,
      captureId: entry.captureId,
      captureGroupIndex: 0,
      state: "formal",
      sourceStatus: outcome.sourceStatus,
      createdAt: entry.createdAt,
      updatedAt: date.toISOString()
    };
    entry.schedule = outcome.schedule;
    entry.updatedAt = date.toISOString();
    return serializeConfirmation("confirmed", entry, { durable: this.durable });
  }

  recordAssessment(deviceId, cardId, input = {}, { now = new Date() } = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const stableCardId = requiredText(cardId, "cardId");
    const request = normalizeAssessmentRequest(input);
    const entry = this.#cardsByDeviceId.get(ownerId)?.get(stableCardId);
    if (!entry || entry.state !== "formal") return null;
    const previous = entry.attemptsById.get(request.attemptId);
    if (previous) return serializeAssessmentResponse(stableCardId, previous, true);

    const date = normalizeDate(now);
    const masteryBefore = entry.masteryStage;
    const masteryAfter = advanceMastery(masteryBefore, request.assessment);
    const schedule = advanceReviewSchedule(entry.schedule, request.assessment, { now: date });
    const attempt = {
      attemptId: request.attemptId,
      assessment: request.assessment,
      assessedAt: date.toISOString(),
      masteryBefore,
      masteryAfter,
      successfulRecallCount: entry.successfulRecallCount + (request.assessment === "remembered" ? 1 : 0),
      reviewCount: entry.reviewCount + 1,
      schedule
    };
    entry.schedule = schedule;
    entry.masteryStage = masteryAfter;
    entry.successfulRecallCount = attempt.successfulRecallCount;
    entry.reviewCount = attempt.reviewCount;
    entry.lastAssessment = request.assessment;
    entry.updatedAt = date.toISOString();
    entry.attemptsById.set(request.attemptId, attempt);
    return serializeAssessmentResponse(stableCardId, attempt, false);
  }

  deleteCard(deviceId, cardId, { now = new Date() } = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const stableCardId = requiredText(cardId, "cardId");
    const cards = this.#cardsByDeviceId.get(ownerId);
    const entry = cards?.get(stableCardId);
    if (!entry) return null;
    this.#incrementPersistenceEpoch(ownerId);
    cards.delete(stableCardId);
    const hasSibling = [...(cards?.values() || [])]
      .some((candidate) => candidate.captureId === entry.captureId);
    if (!hasSibling) this.#captureIdsByDeviceHash.delete(`${ownerId}:${entry.imageSha256}`);
    return serializeDeletion(stableCardId, entry.captureId, normalizeDate(now));
  }

  clearDevice(deviceId) {
    const ownerId = requiredText(deviceId, "deviceId");
    this.#incrementPersistenceEpoch(ownerId);
    const count = this.#cardsByDeviceId.get(ownerId)?.size || 0;
    this.#cardsByDeviceId.delete(ownerId);
    for (const key of this.#captureIdsByDeviceHash.keys()) {
      if (key.startsWith(`${ownerId}:`)) this.#captureIdsByDeviceHash.delete(key);
    }
    return count;
  }

  clear(deviceId) {
    return this.clearDevice(deviceId);
  }

  reset() {
    this.#cardsByDeviceId.clear();
    this.#captureIdsByDeviceHash.clear();
    this.#persistenceEpochByDeviceId.clear();
  }

  #currentPersistenceEpoch(deviceId) {
    if (!this.#persistenceEpochByDeviceId.has(deviceId)) {
      this.#persistenceEpochByDeviceId.set(deviceId, "0");
    }
    return this.#persistenceEpochByDeviceId.get(deviceId);
  }

  #incrementPersistenceEpoch(deviceId) {
    const next = (BigInt(this.#currentPersistenceEpoch(deviceId)) + 1n).toString();
    this.#persistenceEpochByDeviceId.set(deviceId, next);
    return next;
  }

  #deviceCards(deviceId) {
    if (!this.#cardsByDeviceId.has(deviceId)) this.#cardsByDeviceId.set(deviceId, new Map());
    return this.#cardsByDeviceId.get(deviceId);
  }
}

export class PostgresCaptureRepository {
  durable = true;

  constructor(pool = databasePool) {
    if (!pool) throw new Error("PostgresCaptureRepository requires a database pool");
    this.pool = pool;
  }

  async beginPersistence(deviceId) {
    const ownerId = requiredText(deviceId, "deviceId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureDevice(client, ownerId);
      const epoch = await readPersistenceEpoch(client, ownerId);
      await client.query("COMMIT");
      return serializePersistenceEpoch(ownerId, epoch, this.durable);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async persistCaptureResult(deviceId, result, options = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const normalized = normalizeCapturePersistence(result, options);
    if (!normalized) return null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureDevice(client, ownerId);
      const currentEpoch = await readPersistenceEpoch(client, ownerId, { lock: true });
      const expectedEpoch = expectedPersistenceEpoch(options.persistenceEpoch, ownerId);
      if (expectedEpoch !== null && expectedEpoch !== currentEpoch) {
        await client.query("ROLLBACK");
        return serializeStalePersistence(this.durable);
      }
      const accountId = await linkedAccountId(client, ownerId);
      const captureId = `capture-${randomUUID()}`;
      const captureResult = await client.query(
        `INSERT INTO captures (
           id, device_id, account_id, image_sha256, disposition, source_status,
           status, shared_url, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         ON CONFLICT (device_id, image_sha256) WHERE deleted_at IS NULL
         DO UPDATE SET
           account_id = COALESCE(captures.account_id, EXCLUDED.account_id),
           disposition = EXCLUDED.disposition,
           source_status = EXCLUDED.source_status,
           status = EXCLUDED.status,
           shared_url = EXCLUDED.shared_url,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          captureId,
          ownerId,
          accountId,
          normalized.imageSha256,
          normalized.disposition,
          normalized.sourceStatus,
          captureStatus(normalized.state),
          normalized.sourceBinding.sourceUrl,
          normalized.now.toISOString()
        ]
      );
      const capture = captureResult.rows[0];
      const existingResult = await client.query(
        `SELECT * FROM memory_cards
          WHERE capture_id = $1 AND deleted_at IS NULL
          ORDER BY created_at ASC, id ASC
          FOR UPDATE`,
        [capture.id]
      );
      const existingRows = existingResult.rows;
      if (existingRows.some((row) => row.state === "formal")) {
        await client.query(
          `UPDATE captures
              SET disposition = 'create_card', status = 'ready', updated_at = $2
            WHERE id = $1`,
          [capture.id, normalized.now.toISOString()]
        );
        await client.query("COMMIT");
        return serializeDatabaseCaptureGroup(existingRows, { durable: this.durable });
      }

      await persistEvidence(client, capture.id, normalized.evidence);
      const bindingId = `binding-${stableDigest(capture.id)}`;
      await client.query(
        `INSERT INTO source_bindings (
           id, capture_id, status, platform, source_url, source_title,
           source_account, confidence, evidence_keys_json, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10)
         ON CONFLICT (capture_id)
         DO UPDATE SET
           status = EXCLUDED.status,
           platform = EXCLUDED.platform,
           source_url = EXCLUDED.source_url,
           source_title = EXCLUDED.source_title,
           source_account = EXCLUDED.source_account,
           confidence = EXCLUDED.confidence,
           evidence_keys_json = EXCLUDED.evidence_keys_json,
           updated_at = EXCLUDED.updated_at`,
        [
          bindingId,
          capture.id,
          normalized.sourceBinding.status,
          normalized.sourceBinding.platform,
          normalized.sourceBinding.sourceUrl,
          normalized.sourceBinding.sourceTitle,
          normalized.sourceBinding.sourceAccount,
          normalized.sourceBinding.confidence,
          JSON.stringify(normalized.sourceBinding.evidenceKeys),
          normalized.now.toISOString()
        ]
      );

      const desiredCardIds = [];
      for (const [index, candidate] of normalized.memoryCards.entries()) {
        const cardId = options.preserveCardId
          ? candidate.id
          : stableCardId(capture.id, candidate.id);
        desiredCardIds.push(cardId);
        const existing = existingRows.find((row) => row.id === cardId) || null;
        const createdAt = existing?.created_at || normalized.now.toISOString();
        const cardJson = {
          ...candidate,
          id: cardId,
          captureId: capture.id,
          captureGroupIndex: index,
          state: normalized.state === "formal" ? "formal" : "fragment",
          sourceStatus: normalized.sourceStatus,
          createdAt: toIsoString(createdAt),
          updatedAt: normalized.now.toISOString()
        };
        const schedule = normalized.state === "formal"
          ? parseJson(existing?.schedule_json) || normalized.schedules[index]
          : null;
        const sourceEvidenceIds = normalized.state === "formal"
          ? uniqueStrings(candidate.sourceEvidenceIds)
          : [];
        await client.query(
          `INSERT INTO memory_cards (
             id, capture_id, source_binding_id, device_id, account_id, disposition,
             state, card_json, source_evidence_ids_json, schedule_json,
             mastery_stage, successful_recall_count, review_count, last_assessment,
             created_at, updated_at
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
             'sealed', 0, 0, NULL, $11, $12
           )
           ON CONFLICT (id)
           DO UPDATE SET
             source_binding_id = EXCLUDED.source_binding_id,
             account_id = COALESCE(memory_cards.account_id, EXCLUDED.account_id),
             disposition = EXCLUDED.disposition,
             state = EXCLUDED.state,
             card_json = EXCLUDED.card_json,
             source_evidence_ids_json = EXCLUDED.source_evidence_ids_json,
             schedule_json = CASE
               WHEN memory_cards.state = 'formal' THEN memory_cards.schedule_json
               ELSE EXCLUDED.schedule_json
             END,
             updated_at = EXCLUDED.updated_at`,
          [
            cardId,
            capture.id,
            bindingId,
            ownerId,
            accountId,
            normalized.disposition,
            normalized.state,
            JSON.stringify(cardJson),
            JSON.stringify(sourceEvidenceIds),
            schedule ? JSON.stringify(schedule) : null,
            toIsoString(createdAt),
            normalized.now.toISOString()
          ]
        );
      }
      await client.query(
        `DELETE FROM memory_cards
          WHERE capture_id = $1
            AND deleted_at IS NULL
            AND NOT (id = ANY($2::text[]))`,
        [capture.id, desiredCardIds]
      );
      const storedResult = await client.query(
        `SELECT * FROM memory_cards
          WHERE capture_id = $1 AND deleted_at IS NULL`,
        [capture.id]
      );
      const storedById = new Map(storedResult.rows.map((row) => [row.id, row]));
      const stored = desiredCardIds.map((id) => storedById.get(id)).filter(Boolean);
      await client.query("COMMIT");
      return serializeDatabaseCaptureGroup(stored, { durable: this.durable });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(deviceId, options = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const now = normalizeDate(options.now || new Date());
    const result = await this.pool.query(
      `SELECT * FROM memory_cards
        WHERE device_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [ownerId]
    );
    const entries = attachCaptureGroupMetadata(
      result.rows.map((row) => serializeDatabaseEntry(row, { durable: this.durable }))
    )
      .filter((entry) => matchesPool(entryForPool(entry), options.pool, now, options.timeCapsuleDays))
      .sort(compareSerializedEntries);
    return {
      schemaVersion: CAPTURE_MEMORY_CARDS_SCHEMA_VERSION,
      durable: this.durable,
      cards: entries
    };
  }

  async get(deviceId, cardId) {
    const row = await selectCard(this.pool, requiredText(deviceId, "deviceId"), requiredText(cardId, "cardId"));
    return row ? serializeDatabaseEntry(row, { durable: this.durable }) : null;
  }

  async resolveConfirmation(deviceId, cardId, input = {}, { now = new Date() } = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const stableCardId = requiredText(cardId, "cardId");
    const request = normalizeConfirmationRequest(input);
    const date = normalizeDate(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cardResult = await client.query(
        `SELECT * FROM memory_cards
          WHERE device_id = $1 AND id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [ownerId, stableCardId]
      );
      const row = cardResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      if (request.action === "archive") {
        if (row.disposition === "archive_only") {
          await client.query("COMMIT");
          return serializeDatabaseConfirmation("archived", row, {
            durable: this.durable,
            repeated: true
          });
        }
        if (row.state === "formal") {
          throw confirmationConflict("正式记忆卡不能通过待确认接口归档。");
        }
        const cardJson = {
          ...(parseJson(row.card_json) || {}),
          state: "fragment",
          updatedAt: date.toISOString()
        };
        await client.query(
          `UPDATE memory_cards
              SET disposition = 'archive_only',
                  state = 'fragment',
                  card_json = $3::jsonb,
                  source_evidence_ids_json = '[]'::jsonb,
                  schedule_json = NULL,
                  updated_at = $4
            WHERE device_id = $1 AND id = $2`,
          [ownerId, stableCardId, JSON.stringify(cardJson), date.toISOString()]
        );
        await client.query(
          `UPDATE captures
              SET disposition = 'archive_only', status = 'fragment', updated_at = $2
            WHERE id = $1`,
          [row.capture_id, date.toISOString()]
        );
        const stored = {
          ...row,
          disposition: "archive_only",
          state: "fragment",
          card_json: cardJson,
          source_evidence_ids_json: [],
          schedule_json: null,
          updated_at: date.toISOString()
        };
        await client.query("COMMIT");
        return serializeDatabaseConfirmation("archived", stored, { durable: this.durable });
      }

      if (row.state === "formal") {
        await client.query("COMMIT");
        return serializeDatabaseConfirmation("confirmed", row, {
          durable: this.durable,
          repeated: true
        });
      }
      if (row.disposition !== "needs_confirmation") {
        throw confirmationConflict("只有待确认的记忆片段可以确认。");
      }
      const evidenceResult = await client.query(
        `SELECT evidence_key, evidence_type, evidence_text
           FROM evidence_regions
          WHERE capture_id = $1
          ORDER BY created_at ASC, evidence_key ASC`,
        [row.capture_id]
      );
      const evidence = evidenceResult.rows.map((item) => ({
        id: String(item.evidence_key),
        type: String(item.evidence_type || "paragraph"),
        text: String(item.evidence_text || "")
      }));
      const current = parseJson(row.card_json) || {};
      const outcome = buildConfirmedCard({
        cardId: stableCardId,
        existingCard: current,
        evidence,
        sourceStatus: current.sourceStatus || "unconfirmed",
        request,
        now: date
      });
      if (outcome.status === "needs_user_input") {
        await client.query("COMMIT");
        return serializeNeedsUserInput(stableCardId, evidence, outcome);
      }
      const cardJson = {
        ...current,
        ...outcome.card,
        id: stableCardId,
        captureId: String(row.capture_id),
        captureGroupIndex: 0,
        state: "formal",
        sourceStatus: outcome.sourceStatus,
        createdAt: current.createdAt || toIsoString(row.created_at),
        updatedAt: date.toISOString()
      };
      await client.query(
        `UPDATE memory_cards
            SET disposition = 'create_card',
                state = 'formal',
                card_json = $3::jsonb,
                source_evidence_ids_json = $4::jsonb,
                schedule_json = $5::jsonb,
                updated_at = $6
          WHERE device_id = $1 AND id = $2`,
        [
          ownerId,
          stableCardId,
          JSON.stringify(cardJson),
          JSON.stringify(cardJson.sourceEvidenceIds),
          JSON.stringify(outcome.schedule),
          date.toISOString()
        ]
      );
      await client.query(
        `UPDATE captures
            SET disposition = 'create_card',
                source_status = $2,
                status = 'ready',
                updated_at = $3
          WHERE id = $1`,
        [row.capture_id, outcome.sourceStatus, date.toISOString()]
      );
      const stored = {
        ...row,
        disposition: "create_card",
        state: "formal",
        card_json: cardJson,
        source_evidence_ids_json: cardJson.sourceEvidenceIds,
        schedule_json: outcome.schedule,
        updated_at: date.toISOString()
      };
      await client.query("COMMIT");
      return serializeDatabaseConfirmation("confirmed", stored, { durable: this.durable });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAssessment(deviceId, cardId, input = {}, { now = new Date() } = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const stableCardId = requiredText(cardId, "cardId");
    const request = normalizeAssessmentRequest(input);
    const date = normalizeDate(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cardResult = await client.query(
        `SELECT * FROM memory_cards
          WHERE device_id = $1 AND id = $2 AND state = 'formal' AND deleted_at IS NULL
          FOR UPDATE`,
        [ownerId, stableCardId]
      );
      const card = cardResult.rows[0];
      if (!card) {
        await client.query("ROLLBACK");
        return null;
      }
      const previousResult = await client.query(
        `SELECT * FROM recall_attempts WHERE card_id = $1 AND attempt_id = $2`,
        [stableCardId, request.attemptId]
      );
      if (previousResult.rows[0]) {
        await client.query("COMMIT");
        return serializeDatabaseAttempt(stableCardId, previousResult.rows[0], true);
      }

      const currentSchedule = normalizeReviewSchedule(parseJson(card.schedule_json), { now: date });
      const schedule = advanceReviewSchedule(currentSchedule, request.assessment, { now: date });
      const masteryBefore = normalizeMastery(card.mastery_stage);
      const masteryAfter = advanceMastery(masteryBefore, request.assessment);
      const successfulRecallCount = Number(card.successful_recall_count || 0)
        + (request.assessment === "remembered" ? 1 : 0);
      const reviewCount = Number(card.review_count || 0) + 1;
      const attemptId = `attempt-${stableDigest(stableCardId, request.attemptId)}`;
      await client.query(
        `INSERT INTO recall_attempts (
           id, card_id, attempt_id, assessment, assessed_at, mastery_before,
           mastery_after, successful_recall_count, review_count, schedule_json
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          attemptId,
          stableCardId,
          request.attemptId,
          request.assessment,
          date.toISOString(),
          masteryBefore,
          masteryAfter,
          successfulRecallCount,
          reviewCount,
          JSON.stringify(schedule)
        ]
      );
      await client.query(
        `UPDATE memory_cards
            SET schedule_json = $3::jsonb,
                mastery_stage = $4,
                successful_recall_count = $5,
                review_count = $6,
                last_assessment = $7,
                updated_at = $8
          WHERE device_id = $1 AND id = $2`,
        [
          ownerId,
          stableCardId,
          JSON.stringify(schedule),
          masteryAfter,
          successfulRecallCount,
          reviewCount,
          request.assessment,
          date.toISOString()
        ]
      );
      await client.query("COMMIT");
      return serializeAssessmentResponse(stableCardId, {
        attemptId: request.attemptId,
        assessment: request.assessment,
        assessedAt: date.toISOString(),
        masteryBefore,
        masteryAfter,
        successfulRecallCount,
        reviewCount,
        schedule
      }, false);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteCard(deviceId, cardId, { now = new Date() } = {}) {
    const ownerId = requiredText(deviceId, "deviceId");
    const stableCardId = requiredText(cardId, "cardId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingResult = await client.query(
        `SELECT capture_id FROM memory_cards
          WHERE device_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [ownerId, stableCardId]
      );
      if (!existingResult.rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      await ensureDevice(client, ownerId);
      await incrementCapturePersistenceEpochForDevice(client, ownerId);
      const targetResult = await client.query(
        `SELECT capture_id FROM memory_cards
          WHERE device_id = $1 AND id = $2 AND deleted_at IS NULL
          FOR UPDATE`,
        [ownerId, stableCardId]
      );
      const captureId = targetResult.rows[0]?.capture_id;
      if (!captureId) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(
        `DELETE FROM memory_cards
          WHERE device_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [ownerId, stableCardId]
      );
      const siblings = await client.query(
        `SELECT 1 FROM memory_cards
          WHERE capture_id = $1 AND deleted_at IS NULL
          LIMIT 1`,
        [captureId]
      );
      if (!siblings.rows[0]) {
        await client.query("DELETE FROM captures WHERE id = $1", [captureId]);
      }
      await client.query("COMMIT");
      return serializeDeletion(stableCardId, captureId, normalizeDate(now));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async clearDevice(deviceId) {
    const ownerId = requiredText(deviceId, "deviceId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureDevice(client, ownerId);
      await incrementCapturePersistenceEpochForDevice(client, ownerId);
      const result = await client.query(
        "DELETE FROM captures WHERE device_id = $1 RETURNING id",
        [ownerId]
      );
      await client.query("COMMIT");
      return result.rowCount || 0;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async clearAccount(accountId, { requestedDeviceId } = {}) {
    const stableAccountId = requiredText(accountId, "accountId");
    const stableDeviceId = requiredText(requestedDeviceId, "requestedDeviceId");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureDevice(client, stableDeviceId);
      await incrementCapturePersistenceEpochsForAccount(client, {
        accountId: stableAccountId,
        requestedDeviceId: stableDeviceId
      });
      const result = await client.query(
        "DELETE FROM captures WHERE account_id = $1 RETURNING id",
        [stableAccountId]
      );
      await client.query("COMMIT");
      return result.rowCount || 0;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

export const captureMemoryRepository = hasDatabase
  ? new PostgresCaptureRepository(databasePool)
  : new MemoryCaptureRepository();

export function isCapturePersistenceStale(value) {
  return value?.schemaVersion === CAPTURE_PERSISTENCE_STALE_SCHEMA_VERSION
    && value?.status === "cancelled";
}

async function readPersistenceEpoch(queryable, deviceId, { lock = false } = {}) {
  const result = await queryable.query(
    `SELECT capture_persistence_epoch
       FROM devices
      WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [deviceId]
  );
  if (!result.rows[0]) throw new Error("capture persistence device not found");
  return normalizePersistenceEpoch(result.rows[0].capture_persistence_epoch);
}

function serializePersistenceEpoch(deviceId, epoch, durable) {
  return {
    schemaVersion: CAPTURE_PERSISTENCE_EPOCH_SCHEMA_VERSION,
    deviceId,
    epoch: normalizePersistenceEpoch(epoch),
    durable
  };
}

function serializeStalePersistence(durable) {
  return {
    schemaVersion: CAPTURE_PERSISTENCE_STALE_SCHEMA_VERSION,
    status: "cancelled",
    stale: true,
    persisted: false,
    errorCode: "capture_persistence_stale",
    reason: "device_persistence_epoch_changed",
    durable
  };
}

function expectedPersistenceEpoch(value, deviceId) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    const tokenDeviceId = cleanText(value.deviceId);
    if (tokenDeviceId && tokenDeviceId !== deviceId) {
      throw repositoryError(
        "capture_persistence_epoch_device_mismatch",
        "persistence epoch 与设备不匹配。"
      );
    }
    return normalizePersistenceEpoch(value.epoch);
  }
  return normalizePersistenceEpoch(value);
}

function normalizePersistenceEpoch(value) {
  const epoch = String(value ?? "").trim();
  if (!/^\d+$/.test(epoch)) {
    throw repositoryError("capture_persistence_epoch_invalid", "persistence epoch 无效。");
  }
  return BigInt(epoch).toString();
}

function normalizeCapturePersistence(result, options = {}) {
  const captureAnalysis = result?.captureAnalysis;
  if (!captureAnalysis || captureAnalysis.schemaVersion !== "capture_memory_card_2") return null;
  const now = normalizeDate(options.now || new Date());
  const analysisCards = Array.isArray(captureAnalysis.memoryCards)
    ? captureAnalysis.memoryCards
    : captureAnalysis.memoryCard ? [captureAnalysis.memoryCard] : [];
  const imageSha256 = normalizeImageSha(options.imageSha256)
    || fallbackImageHash(options.deviceId, analysisCards[0]?.id || result?.memoryCard?.id);
  const evidence = normalizeEvidence(options.evidence);
  const disposition = normalizeDisposition(captureAnalysis.disposition);
  const sourceStatus = normalizeSourceStatus(captureAnalysis.sourceStatus);
  const requestedCards = disposition === "create_card" ? analysisCards.slice(0, 3) : [];
  const referencedIdsByCard = requestedCards.map((card) => uniqueStrings(card?.sourceEvidenceIds));
  const referencedIds = uniqueStrings(referencedIdsByCard.flat());
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const formalEvidenceValid = requestedCards.length > 0
    && requestedCards.every((card, index) => (
      Boolean(card?.id)
      && referencedIdsByCard[index].length > 0
      && referencedIdsByCard[index].every((id) => evidenceIds.has(id))
    ));
  const effectiveDisposition = disposition === "create_card" && !formalEvidenceValid
    ? "needs_confirmation"
    : disposition;
  const state = effectiveDisposition === "create_card"
    ? "formal"
    : effectiveDisposition === "archive_only" ? "fragment" : "pending";
  const sourceContext = normalizeSourceContext(captureAnalysis.sourceContext);
  const memoryCards = state === "formal"
    ? requestedCards.map((card) => ({
        ...structuredClone(card),
        ...(normalizeSourceContext(card?.sourceContext) || sourceContext
          ? { sourceContext: normalizeSourceContext(card?.sourceContext) || sourceContext }
          : {})
      }))
    : [normalizeFragmentCard(result?.memoryCard, captureAnalysis, now)];
  const requestedSchedules = Array.isArray(captureAnalysis.schedules)
    ? captureAnalysis.schedules
    : [];
  const schedules = state === "formal"
    ? memoryCards.map((card, index) => {
        const requested = requestedSchedules.find((item) => item?.cardId === card.id)
          || requestedSchedules[index]
          || (index === 0 ? captureAnalysis.schedule : null);
        return {
          cardId: card.id,
          ...normalizeReviewSchedule(requested, { now })
        };
      })
    : [];
  const sourceEvidenceIds = state === "formal" ? referencedIds : [];
  const persistedEvidence = state === "formal"
    ? evidence.filter((item) => sourceEvidenceIds.includes(item.id))
    : evidence.slice(0, 1).map((item) => ({ ...item, text: item.text.slice(0, 2_000) }));
  const sourceBinding = normalizeSourceBinding(
    result,
    sourceStatus,
    persistedEvidence,
    sourceEvidenceIds
  );
  return {
    now,
    imageSha256,
    disposition: effectiveDisposition,
    state,
    sourceStatus,
    sourceContext,
    memoryCards,
    memoryCard: memoryCards[0],
    schedules,
    schedule: schedules[0] || null,
    evidence: persistedEvidence,
    sourceEvidenceIds,
    sourceBinding
  };
}

function normalizeFragmentCard(value, analysis, now) {
  const candidate = value && typeof value === "object" ? value : {};
  const decision = cleanText(analysis?.decisionReason) || "这张截图需要更多上下文。";
  const coreKnowledge = cleanText(candidate.coreKnowledge) || "这张截图还需要更多上下文";
  return {
    id: cleanText(candidate.id) || `fragment-${stableDigest(coreKnowledge, decision)}`,
    state: "fragment",
    coreKnowledge,
    recallCue: cleanText(candidate.recallCue) || "你当时想记住这张截图里的什么？",
    explanation: cleanText(candidate.explanation) || decision,
    sourceStatus: normalizeSourceStatus(analysis?.sourceStatus),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function normalizeSourceBinding(result, sourceStatus, evidence, sourceEvidenceIds) {
  const source = result?.source || {};
  const link = result?.link || {};
  const exactContext = result?.search?.provider === "input";
  const status = exactContext
    ? "exact_context"
    : sourceStatus === "verified" ? "verified_match"
      : sourceStatus === "partial" ? "probable_match" : "unresolved";
  return {
    status,
    platform: cleanText(source.platform || link.platform).slice(0, 64),
    sourceUrl: cleanText(source.url || link.url).slice(0, 2_048),
    sourceTitle: cleanText(source.title || link.title).slice(0, 512),
    sourceAccount: cleanText(source.account || link.account).slice(0, 256),
    confidence: Number.isFinite(Number(link.confidence)) ? Number(link.confidence) : null,
    evidenceKeys: sourceEvidenceIds.length ? sourceEvidenceIds : evidence.map((item) => item.id)
  };
}

function normalizeSourceContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const blocks = [];
  const blockIds = new Set();
  let characters = 0;
  for (const [index, item] of (Array.isArray(value.blocks) ? value.blocks : []).entries()) {
    if (blocks.length >= 64 || characters >= 40_000) break;
    const id = cleanText(item?.id).slice(0, 160) || `context-${index + 1}`;
    const originalText = cleanText(item?.text);
    if (!originalText || blockIds.has(id)) continue;
    const text = originalText.slice(0, 40_000 - characters);
    blockIds.add(id);
    characters += text.length;
    blocks.push({
      id,
      ...(cleanText(item?.type) ? { type: cleanText(item.type).slice(0, 64) } : {}),
      text,
      ...(cleanText(item?.sourceRole)
        ? { sourceRole: cleanText(item.sourceRole).slice(0, 64) }
        : {}),
      ...(Number.isFinite(Number(item?.startSeconds))
        ? { startSeconds: Number(item.startSeconds) }
        : {}),
      ...(Number.isFinite(Number(item?.endSeconds))
        ? { endSeconds: Number(item.endSeconds) }
        : {})
    });
  }
  const completeness = ["full", "partial", "screenshot_only"].includes(value.completeness)
    ? value.completeness
    : "partial";
  const overview = value.overview && typeof value.overview === "object"
    ? value.overview
    : {};
  return {
    schemaVersion: "capture_source_context_1",
    nearbyText: cleanText(value.nearbyText).slice(0, 8_000),
    focusBlockIds: uniqueStrings(value.focusBlockIds)
      .filter((id) => blockIds.has(id))
      .slice(0, 64),
    blocks,
    overview: {
      summary: cleanText(overview.summary).slice(0, 800),
      highlights: uniqueStrings(overview.highlights)
        .slice(0, 3)
        .map((text) => text.slice(0, 320))
    },
    completeness
  };
}

function normalizeEvidence(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map((item, index) => {
    const id = cleanText(item?.id).slice(0, 160) || `evidence-${index + 1}`;
    const text = cleanText(item?.text).slice(0, 12_000);
    if (!text || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      type: cleanText(item?.type).slice(0, 64) || "paragraph",
      text,
      bounds: normalizeEvidenceBounds(item?.bounds),
      confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : null,
      startSeconds: finiteOrNull(item?.startSeconds),
      endSeconds: finiteOrNull(item?.endSeconds),
      modelVersion: cleanText(item?.modelVersion).slice(0, 160)
    };
  }).filter(Boolean).slice(0, 64);
}

async function persistEvidence(client, captureId, evidence) {
  await client.query("DELETE FROM evidence_regions WHERE capture_id = $1", [captureId]);
  for (const item of evidence) {
    await client.query(
      `INSERT INTO evidence_regions (
         id, capture_id, evidence_key, evidence_type, evidence_text, bounds_json,
         confidence, start_seconds, end_seconds, model_version
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
      [
        `evidence-${stableDigest(captureId, item.id)}`,
        captureId,
        item.id,
        item.type,
        item.text,
        item.bounds ? JSON.stringify(item.bounds) : null,
        item.confidence,
        item.startSeconds,
        item.endSeconds,
        item.modelVersion
      ]
    );
  }
}

async function ensureDevice(client, deviceId) {
  await client.query(
    `INSERT INTO devices (id) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW()`,
    [deviceId]
  );
}

async function linkedAccountId(client, deviceId) {
  const result = await client.query(
    `SELECT account_id FROM account_device_links
      WHERE device_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
    [deviceId]
  );
  return result.rows[0]?.account_id || null;
}

async function selectCard(queryable, deviceId, cardId) {
  const result = await queryable.query(
    `SELECT * FROM memory_cards
      WHERE device_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [deviceId, cardId]
  );
  return result.rows[0] || null;
}

function serializeDatabaseEntry(row, { durable }) {
  const memoryCard = parseJson(row.card_json) || {};
  return {
    ...memoryCard,
    id: String(row.id),
    captureId: String(row.capture_id),
    disposition: normalizeDisposition(row.disposition),
    state: row.state === "formal" ? "formal" : "fragment",
    schedule: row.state === "formal" ? parseJson(row.schedule_json) : null,
    masteryStage: normalizeMastery(row.mastery_stage),
    successfulRecallCount: Number(row.successful_recall_count || 0),
    reviewCount: Number(row.review_count || 0),
    lastAssessment: row.last_assessment || undefined,
    capturedAt: toIsoString(row.created_at),
    createdAt: memoryCard.createdAt || toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    durable
  };
}

function serializeDatabaseCaptureGroup(rows, { durable }) {
  const memoryCards = attachCaptureGroupMetadata(
    rows
      .map((row) => serializeDatabaseEntry(row, { durable }))
      .sort(compareCaptureGroupCards)
  );
  const primary = memoryCards[0] || null;
  if (!primary) return null;
  return {
    ...primary,
    memoryCards,
    memoryCard: primary,
    schedules: memoryCards
      .filter((card) => card.state === "formal" && card.schedule)
      .map((card) => ({ cardId: card.id, ...structuredClone(card.schedule) })),
    schedule: primary.schedule || null
  };
}

function serializeEntry(entry, { durable }) {
  return {
    ...structuredClone(entry.memoryCard),
    captureId: entry.captureId,
    disposition: normalizeDisposition(entry.disposition),
    state: entry.state === "formal" ? "formal" : "fragment",
    sourceStatus: entry.sourceStatus,
    schedule: entry.state === "formal" ? structuredClone(entry.schedule) : null,
    masteryStage: entry.masteryStage,
    successfulRecallCount: entry.successfulRecallCount,
    reviewCount: entry.reviewCount,
    ...(entry.lastAssessment ? { lastAssessment: entry.lastAssessment } : {}),
    capturedAt: entry.createdAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    durable
  };
}

function serializeCaptureGroup(entries, { durable }) {
  const memoryCards = attachCaptureGroupMetadata(
    entries
      .map((entry) => serializeEntry(entry, { durable }))
      .sort(compareCaptureGroupCards)
  );
  const primary = memoryCards[0] || null;
  if (!primary) return null;
  return {
    ...primary,
    memoryCards,
    memoryCard: primary,
    schedules: memoryCards
      .filter((card) => card.state === "formal" && card.schedule)
      .map((card) => ({ cardId: card.id, ...structuredClone(card.schedule) })),
    schedule: primary.schedule || null
  };
}

function attachCaptureGroupMetadata(cards) {
  const groups = new Map();
  for (const card of cards) {
    const captureId = String(card.captureId || "");
    if (!groups.has(captureId)) groups.set(captureId, []);
    groups.get(captureId).push(card);
  }
  return cards.map((card) => {
    const group = [...(groups.get(String(card.captureId || "")) || [card])]
      .sort(compareCaptureGroupCards);
    const cardIds = group.map((item) => item.id);
    return {
      ...card,
      captureGroup: {
        captureId: card.captureId,
        cardIds,
        count: cardIds.length,
        index: Math.max(0, cardIds.indexOf(card.id))
      }
    };
  });
}

function compareCaptureGroupCards(left, right) {
  const leftIndex = Number(left?.captureGroupIndex);
  const rightIndex = Number(right?.captureGroupIndex);
  const leftHasIndex = Number.isInteger(leftIndex) && leftIndex >= 0;
  const rightHasIndex = Number.isInteger(rightIndex) && rightIndex >= 0;
  if (leftHasIndex && rightHasIndex && leftIndex !== rightIndex) return leftIndex - rightIndex;
  if (leftHasIndex !== rightHasIndex) return leftHasIndex ? -1 : 1;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function serializeDatabaseAttempt(cardId, row, repeated) {
  return serializeAssessmentResponse(cardId, {
    attemptId: row.attempt_id,
    assessment: row.assessment,
    assessedAt: toIsoString(row.assessed_at),
    masteryBefore: row.mastery_before,
    masteryAfter: row.mastery_after,
    successfulRecallCount: Number(row.successful_recall_count || 0),
    reviewCount: Number(row.review_count || 0),
    schedule: parseJson(row.schedule_json)
  }, repeated);
}

function serializeAssessmentResponse(cardId, attempt, repeated) {
  return {
    schemaVersion: CAPTURE_MEMORY_ASSESSMENT_SCHEMA_VERSION,
    cardId,
    assessment: {
      attemptId: attempt.attemptId,
      assessment: attempt.assessment,
      assessedAt: attempt.assessedAt,
      repeated
    },
    mastery: {
      before: attempt.masteryBefore,
      after: attempt.masteryAfter,
      successfulRecallCount: attempt.successfulRecallCount,
      reviewCount: attempt.reviewCount
    },
    schedule: structuredClone(attempt.schedule)
  };
}

function serializeDeletion(cardId, captureId, now) {
  return {
    schemaVersion: CAPTURE_MEMORY_DELETION_SCHEMA_VERSION,
    deleted: true,
    cardId,
    captureId,
    deletedAt: now.toISOString()
  };
}

function normalizeConfirmationRequest(input) {
  const action = cleanText(input?.action).toLowerCase();
  if (!["confirm", "archive"].includes(action)) {
    throw repositoryError(
      "capture_memory_confirmation_action_invalid",
      "action 必须是 confirm 或 archive。"
    );
  }
  return {
    action,
    coreKnowledge: cleanText(input?.coreKnowledge).slice(0, 2_000),
    hiddenSemantic: cleanText(input?.hiddenSemantic).slice(0, 500),
    recallCue: cleanText(input?.recallCue).slice(0, 500),
    sourceEvidenceId: cleanText(input?.sourceEvidenceId).slice(0, 160)
  };
}

function buildConfirmedCard({
  cardId,
  existingCard,
  evidence,
  sourceStatus,
  request,
  now
}) {
  const availableEvidence = (Array.isArray(evidence) ? evidence : [])
    .map((item) => ({
      id: cleanText(item?.id).slice(0, 160),
      type: cleanText(item?.type).slice(0, 64) || "paragraph",
      text: cleanText(item?.text).slice(0, 12_000)
    }))
    .filter((item) => item.id && item.text);
  const requestedEvidence = request.sourceEvidenceId
    ? availableEvidence.filter((item) => item.id === request.sourceEvidenceId)
    : availableEvidence;
  const coreKnowledge = request.coreKnowledge || cleanText(existingCard?.coreKnowledge);
  const matchingEvidence = requestedEvidence.find((item) => (
    coreKnowledge.length >= 4 && item.text.includes(coreKnowledge)
  ));
  if (!matchingEvidence) {
    return {
      status: "needs_user_input",
      message: availableEvidence.length === 0
        ? "这条待确认内容没有可复用的识别证据，不能直接生成正式卡。"
        : "请从已识别文字中选择或输入一条连续、可核对的核心知识。",
      requiredFields: ["coreKnowledge"]
    };
  }

  const hiddenSemantic = request.hiddenSemantic || coreKnowledge;
  if (occurrenceCount(coreKnowledge, hiddenSemantic) !== 1) {
    return {
      status: "needs_user_input",
      message: "hiddenSemantic 必须在 coreKnowledge 中作为连续片段恰好出现一次。",
      requiredFields: ["hiddenSemantic"]
    };
  }
  const evidenceIds = [matchingEvidence.id];
  const explanation = coreKnowledge;
  const prompt = replaceOne(coreKnowledge, hiddenSemantic, "____");
  const optionTexts = uniqueConfirmationOptions(hiddenSemantic);
  const variantPrefix = stableDigest(cardId, matchingEvidence.id, coreKnowledge);
  const card = {
    id: cardId,
    coreKnowledge,
    recallCue: request.recallCue || "你能回忆出这条已确认的知识吗？",
    hiddenSemantic,
    explanation,
    sourceEvidenceIds: evidenceIds,
    rarity: "R",
    rarityReason: "这是一条由用户确认、可在单条识别证据中核对的局部知识。",
    rarityConfidence: 1,
    rarityRuleVersion: CAPTURE_RARITY_RULE_VERSION,
    recallVariants: [
      {
        id: `confirmation-cloze-${variantPrefix}`,
        type: "semantic_cloze",
        prompt,
        answer: hiddenSemantic,
        options: [],
        correctOptionId: null,
        correctBoolean: null,
        explanation,
        sourceEvidenceIds: evidenceIds
      },
      {
        id: `confirmation-boolean-${variantPrefix}`,
        type: "true_false",
        prompt: coreKnowledge,
        answer: "true",
        options: [],
        correctOptionId: null,
        correctBoolean: true,
        explanation,
        sourceEvidenceIds: evidenceIds
      },
      {
        id: `confirmation-choice-${variantPrefix}`,
        type: "multiple_choice",
        prompt: `以下哪一项准确补全这条已确认知识：${prompt}`,
        answer: hiddenSemantic,
        options: optionTexts.map((text, index) => ({
          id: `option-${index + 1}`,
          text
        })),
        correctOptionId: "option-1",
        correctBoolean: null,
        explanation,
        sourceEvidenceIds: evidenceIds
      }
    ],
    sourceStatus: sourceStatus === "verified" ? "verified" : "partial",
    sourceTitle: cleanText(existingCard?.sourceTitle) || undefined,
    sourceUrl: cleanText(existingCard?.sourceUrl) || undefined
  };
  const validated = validateCaptureMemoryOutput({
    disposition: "create_card",
    decisionReason: "用户确认了已持久化识别证据中的核心知识。",
    memoryCards: [card]
  }, {
    evidence: availableEvidence,
    sourceStatus: card.sourceStatus
  });
  if (!validated.ok) {
    return {
      status: "needs_user_input",
      message: validated.errors[0] || "确认内容没有通过证据质量检查。",
      requiredFields: ["coreKnowledge"]
    };
  }
  return {
    status: "confirmed",
    card,
    sourceStatus: card.sourceStatus,
    schedule: createInitialReviewSchedule({ now })
  };
}

function uniqueConfirmationOptions(correct) {
  const candidates = [
    correct,
    "这条内容仍待确认",
    "这条内容需要重新识别",
    "这条内容已被删除"
  ];
  const result = [];
  for (const candidate of candidates) {
    let text = candidate;
    while (result.includes(text)) text = `${text}（非答案）`;
    result.push(text);
  }
  return result;
}

function serializeNeedsUserInput(cardId, evidence, outcome) {
  return {
    schemaVersion: CAPTURE_MEMORY_CONFIRMATION_SCHEMA_VERSION,
    status: "needs_user_input",
    action: "confirm",
    cardId,
    repeated: false,
    message: outcome.message,
    requiredFields: outcome.requiredFields,
    evidence: (Array.isArray(evidence) ? evidence : []).slice(0, 8).map((item) => ({
      id: cleanText(item?.id).slice(0, 160),
      text: cleanText(item?.text).slice(0, 800)
    })).filter((item) => item.id && item.text)
  };
}

function serializeConfirmation(status, entry, { durable, repeated = false } = {}) {
  return {
    schemaVersion: CAPTURE_MEMORY_CONFIRMATION_SCHEMA_VERSION,
    status,
    action: status === "confirmed" ? "confirm" : "archive",
    cardId: entry.memoryCard.id,
    repeated,
    card: serializeEntry(entry, { durable })
  };
}

function serializeDatabaseConfirmation(status, row, { durable, repeated = false } = {}) {
  return {
    schemaVersion: CAPTURE_MEMORY_CONFIRMATION_SCHEMA_VERSION,
    status,
    action: status === "confirmed" ? "confirm" : "archive",
    cardId: String(row.id),
    repeated,
    card: serializeDatabaseEntry(row, { durable })
  };
}

function occurrenceCount(text, fragment) {
  if (!fragment) return 0;
  return String(text).split(String(fragment)).length - 1;
}

function replaceOne(text, fragment, replacement) {
  const index = text.indexOf(fragment);
  return `${text.slice(0, index)}${replacement}${text.slice(index + fragment.length)}`;
}

function confirmationConflict(message) {
  const error = repositoryError("capture_memory_confirmation_conflict", message);
  error.statusCode = 409;
  return error;
}

function normalizeAssessmentRequest(input) {
  const attemptId = requiredText(input.attemptId, "attemptId");
  if (attemptId.length > 160) {
    throw repositoryError("capture_memory_attempt_id_invalid", "attemptId 不能超过 160 个字符。");
  }
  if (!REVIEW_ASSESSMENTS.includes(input.assessment)) {
    throw repositoryError(
      "capture_memory_assessment_invalid",
      "assessment 必须是 remembered、fuzzy 或 forgot。"
    );
  }
  return { attemptId, assessment: input.assessment };
}

export function advanceMastery(current, assessment) {
  const stage = normalizeMastery(current);
  if (stage === "sealed") return "awakened";
  if (assessment !== "remembered") return stage;
  if (stage === "awakened") return "solidified";
  return "engraved";
}

function matchesPool(entry, pool, now, timeCapsuleDays = 30) {
  const normalizedPool = cleanText(pool).toLowerCase();
  if (!normalizedPool) return true;
  if (entry.state !== "formal" || !entry.schedule) return false;
  if (normalizedPool === "due") return Date.parse(entry.schedule.nextReviewAt || "") <= now.getTime();
  if (normalizedPool === "fading") return ["fuzzy", "forgot"].includes(entry.lastAssessment);
  if (normalizedPool === "time_capsule") {
    const ageMs = now.getTime() - Date.parse(entry.createdAt || "");
    return Number.isFinite(ageMs) && ageMs >= Math.max(1, Number(timeCapsuleDays) || 30) * 86_400_000;
  }
  throw repositoryError("capture_memory_pool_invalid", "pool 必须是 due、fading 或 time_capsule。");
}

function entryForPool(value) {
  return {
    state: value.state,
    schedule: value.schedule,
    lastAssessment: value.lastAssessment,
    createdAt: value.capturedAt || value.createdAt
  };
}

function compareEntries(left, right) {
  const leftDue = Date.parse(left.schedule?.nextReviewAt || "") || Number.MAX_SAFE_INTEGER;
  const rightDue = Date.parse(right.schedule?.nextReviewAt || "") || Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;
  return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
}

function compareSerializedEntries(left, right) {
  return compareEntries(entryForPool(left), entryForPool(right));
}

function captureStatus(state) {
  return state === "formal" ? "ready" : state === "fragment" ? "fragment" : "pending";
}

function normalizeDisposition(value) {
  return ["create_card", "archive_only", "needs_confirmation"].includes(value)
    ? value
    : "needs_confirmation";
}

function normalizeSourceStatus(value) {
  return ["verified", "partial", "unconfirmed"].includes(value) ? value : "unconfirmed";
}

function normalizeMastery(value) {
  return MASTERY_STAGES.includes(value) ? value : "sealed";
}

function normalizeImageSha(value) {
  const hash = cleanText(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function fallbackImageHash(...values) {
  return createHash("sha256").update(values.map(cleanText).join("\n") || randomUUID()).digest("hex");
}

function stableCardId(captureId, preferredId) {
  return `card-${stableDigest(captureId, preferredId)}`;
}

function stableDigest(...values) {
  return createHash("sha256").update(values.map(cleanText).join("\n")).digest("hex").slice(0, 24);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean))];
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEvidenceBounds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const bounds = {};
  for (const key of ["x", "y", "width", "height", "page"]) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) bounds[key] = number;
  }
  return Object.keys(bounds).length ? bounds : null;
}


function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return structuredClone(value);
  try { return JSON.parse(String(value)); } catch { return null; }
}

function requiredText(value, field) {
  const text = cleanText(value);
  if (!text) throw repositoryError("capture_memory_request_invalid", `${field} 不能为空。`);
  return text;
}

function cleanText(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw repositoryError("capture_memory_time_invalid", "时间无效。");
  }
  return date;
}

function toIsoString(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function repositoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 422;
  return error;
}
