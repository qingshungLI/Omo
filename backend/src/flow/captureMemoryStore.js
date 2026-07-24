import {
  advanceReviewSchedule,
  createInitialReviewSchedule,
  normalizeReviewSchedule,
  REVIEW_ASSESSMENTS
} from "./reviewSchedule.js";

export const CAPTURE_MEMORY_CARDS_SCHEMA_VERSION = "capture_memory_cards_1";
export const CAPTURE_MEMORY_ASSESSMENT_SCHEMA_VERSION = "capture_memory_assessment_1";

export class CaptureMemoryStore {
  #cardsByDeviceId = new Map();

  upsertCaptureAnalysis(deviceId, captureAnalysis, { now = new Date() } = {}) {
    const ownerId = normalizeRequiredText(deviceId, "deviceId");
    if (
      captureAnalysis?.schemaVersion !== "capture_memory_card_2"
      || captureAnalysis?.disposition !== "create_card"
      || !captureAnalysis?.memoryCard?.id
    ) {
      return null;
    }

    const date = normalizeDate(now);
    const cards = this.#deviceCards(ownerId);
    const cardId = String(captureAnalysis.memoryCard.id);
    const existing = cards.get(cardId);
    const schedule = existing?.schedule
      || normalizeReviewSchedule(captureAnalysis.schedule, { now: date });
    const entry = {
      memoryCard: structuredClone(captureAnalysis.memoryCard),
      sourceStatus: normalizeSourceStatus(captureAnalysis.sourceStatus),
      schedule,
      createdAt: existing?.createdAt || date.toISOString(),
      updatedAt: date.toISOString(),
      lastAssessment: existing?.lastAssessment || null,
      attemptsById: existing?.attemptsById || new Map()
    };
    cards.set(cardId, entry);
    return serializeEntry(entry);
  }

  list(deviceId, {
    pool = "",
    now = new Date(),
    timeCapsuleDays = 30
  } = {}) {
    const ownerId = normalizeRequiredText(deviceId, "deviceId");
    const date = normalizeDate(now);
    const entries = [...(this.#cardsByDeviceId.get(ownerId)?.values() || [])]
      .filter((entry) => matchesPool(entry, pool, date, timeCapsuleDays))
      .sort(compareEntries);
    return {
      schemaVersion: CAPTURE_MEMORY_CARDS_SCHEMA_VERSION,
      cards: entries.map(serializeEntry)
    };
  }

  get(deviceId, cardId) {
    const ownerId = normalizeRequiredText(deviceId, "deviceId");
    const stableCardId = normalizeRequiredText(cardId, "cardId");
    const entry = this.#cardsByDeviceId.get(ownerId)?.get(stableCardId);
    return entry ? serializeEntry(entry) : null;
  }

  recordAssessment(deviceId, cardId, {
    attemptId,
    assessment
  } = {}, {
    now = new Date()
  } = {}) {
    const ownerId = normalizeRequiredText(deviceId, "deviceId");
    const stableCardId = normalizeRequiredText(cardId, "cardId");
    const stableAttemptId = normalizeRequiredText(attemptId, "attemptId");
    if (stableAttemptId.length > 160) {
      throw storeError(
        "capture_memory_attempt_id_invalid",
        "attemptId 不能超过 160 个字符。"
      );
    }
    if (!REVIEW_ASSESSMENTS.includes(assessment)) {
      throw storeError(
        "capture_memory_assessment_invalid",
        "assessment 必须是 remembered、fuzzy 或 forgot。"
      );
    }

    const entry = this.#cardsByDeviceId.get(ownerId)?.get(stableCardId);
    if (!entry) return null;
    const previous = entry.attemptsById.get(stableAttemptId);
    if (previous) return serializeAssessmentResponse(stableCardId, previous, true);

    const date = normalizeDate(now);
    const schedule = advanceReviewSchedule(entry.schedule, assessment, { now: date });
    const attempt = {
      attemptId: stableAttemptId,
      assessment,
      assessedAt: date.toISOString(),
      schedule: structuredClone(schedule)
    };
    entry.schedule = schedule;
    entry.lastAssessment = assessment;
    entry.updatedAt = date.toISOString();
    entry.attemptsById.set(stableAttemptId, attempt);
    return serializeAssessmentResponse(stableCardId, attempt, false);
  }

  clear(deviceId) {
    const ownerId = normalizeRequiredText(deviceId, "deviceId");
    this.#cardsByDeviceId.delete(ownerId);
  }

  reset() {
    this.#cardsByDeviceId.clear();
  }

  #deviceCards(deviceId) {
    if (!this.#cardsByDeviceId.has(deviceId)) {
      this.#cardsByDeviceId.set(deviceId, new Map());
    }
    return this.#cardsByDeviceId.get(deviceId);
  }
}

export const captureMemoryStore = new CaptureMemoryStore();

function serializeEntry(entry) {
  return {
    ...structuredClone(entry.memoryCard),
    sourceStatus: entry.sourceStatus,
    schedule: structuredClone(entry.schedule || createInitialReviewSchedule()),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...(entry.lastAssessment ? { lastAssessment: entry.lastAssessment } : {})
  };
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
    schedule: structuredClone(attempt.schedule)
  };
}

function matchesPool(entry, pool, now, timeCapsuleDays) {
  const normalizedPool = String(pool || "").trim().toLowerCase();
  if (!normalizedPool) return true;
  if (normalizedPool === "due") {
    return Date.parse(entry.schedule?.nextReviewAt || "") <= now.getTime();
  }
  if (normalizedPool === "fading") {
    return ["fuzzy", "forgot"].includes(entry.lastAssessment);
  }
  if (normalizedPool === "time_capsule") {
    const ageMs = now.getTime() - Date.parse(entry.createdAt || "");
    return Number.isFinite(ageMs) && ageMs >= Math.max(1, Number(timeCapsuleDays) || 30) * 86_400_000;
  }
  throw storeError(
    "capture_memory_pool_invalid",
    "pool 必须是 due、fading 或 time_capsule。"
  );
}

function compareEntries(left, right) {
  const leftDue = Date.parse(left.schedule?.nextReviewAt || "") || Number.MAX_SAFE_INTEGER;
  const rightDue = Date.parse(right.schedule?.nextReviewAt || "") || Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;
  return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
}

function normalizeSourceStatus(value) {
  return ["verified", "partial", "unconfirmed"].includes(value) ? value : "unconfirmed";
}

function normalizeRequiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) {
    throw storeError("capture_memory_request_invalid", `${field} 不能为空。`);
  }
  return text;
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw storeError("capture_memory_time_invalid", "时间无效。");
  }
  return date;
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 422;
  return error;
}
