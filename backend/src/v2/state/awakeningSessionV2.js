import { createHash, randomUUID } from "node:crypto";

import {
  answerQuestionV2,
  createReviewSessionV2,
  normalizeReviewSessionV2
} from "./reviewSessionV2.js";

export const V2_AWAKENING_SESSION_SCHEMA_VERSION = "v2_awakening_session_1";

const ACTIVE_STATUSES = new Set([
  "revealed_unanswered",
  "feedback"
]);
const DAY_MS = 86_400_000;

export function listAwakeningCandidatesV2(
  chapters,
  {
    deviceId = "",
    now = new Date().toISOString(),
    excludeQuestionId = ""
  } = {}
) {
  const nowMs = Date.parse(now);
  const candidates = [];

  for (const chapter of Array.isArray(chapters) ? chapters : []) {
    if (!isReviewableChapter(chapter)) continue;

    const questionStates = chapter.v2ReviewSession?.questionStates || {};
    for (const unit of chapter.units) {
      for (const question of Array.isArray(unit.questions) ? unit.questions : []) {
        if (!isSupportedQuestion(question)) continue;

        const questionState = questionStates[question.id];
        const scheduling = schedulingState(questionState, nowMs);
        if (!scheduling) continue;

        candidates.push({
          chapter,
          unit,
          question,
          priority: scheduling.priority,
          dueReason: scheduling.dueReason,
          lifecycleState: scheduling.lifecycleState,
          answeredAtMs: scheduling.answeredAtMs,
          sourceAgeDays: ageInDays(chapter.createdAt, nowMs),
          visualSeed: stableHash(`${deviceId}:${chapter.id}:${unit.id}:${question.id}`)
        });
      }
    }
  }

  const sorted = candidates.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    if (left.answeredAtMs !== right.answeredAtMs) return left.answeredAtMs - right.answeredAtMs;
    return stableHash(`${deviceId}:${left.question.id}`)
      .localeCompare(stableHash(`${deviceId}:${right.question.id}`));
  });

  if (!excludeQuestionId || sorted.length < 2) return sorted;
  const withoutPrevious = sorted.filter((candidate) => candidate.question.id !== excludeQuestionId);
  return withoutPrevious.length ? withoutPrevious : sorted;
}

export function createAwakeningSessionV2(
  chapters,
  {
    deviceId = "",
    now = new Date().toISOString(),
    sessionId = `v2-awakening-${randomUUID()}`,
    excludeQuestionId = ""
  } = {}
) {
  const candidates = listAwakeningCandidatesV2(chapters, {
    deviceId,
    now,
    excludeQuestionId
  });
  const candidate = candidates[0];
  if (!candidate) {
    return {
      session: null,
      chapter: null,
      availableCount: 0
    };
  }

  return {
    session: {
      schemaVersion: V2_AWAKENING_SESSION_SCHEMA_VERSION,
      id: sessionId,
      status: "revealed_unanswered",
      chapterId: candidate.chapter.id,
      unitId: candidate.unit.id,
      questionId: candidate.question.id,
      dueReason: candidate.dueReason,
      lifecycleState: candidate.lifecycleState,
      sourceType: normalizeSourceType(candidate.chapter.source?.type),
      sourceAgeDays: candidate.sourceAgeDays,
      visualSeed: candidate.visualSeed,
      answer: null,
      revealedAt: now,
      answeredAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    },
    chapter: candidate.chapter,
    availableCount: candidates.length
  };
}

export function normalizeAwakeningSessionV2(session) {
  if (!session || typeof session !== "object") return null;
  const status = ACTIVE_STATUSES.has(session.status) || session.status === "completed"
    ? session.status
    : "revealed_unanswered";

  return {
    schemaVersion: V2_AWAKENING_SESSION_SCHEMA_VERSION,
    id: String(session.id || ""),
    status,
    chapterId: String(session.chapterId || ""),
    unitId: String(session.unitId || ""),
    questionId: String(session.questionId || ""),
    dueReason: normalizeDueReason(session.dueReason),
    lifecycleState: normalizeLifecycleState(session.lifecycleState),
    sourceType: normalizeSourceType(session.sourceType),
    sourceAgeDays: Math.max(0, Number(session.sourceAgeDays) || 0),
    visualSeed: String(session.visualSeed || ""),
    answer: normalizeAnswer(session.answer),
    revealedAt: nullableString(session.revealedAt),
    answeredAt: nullableString(session.answeredAt),
    completedAt: nullableString(session.completedAt),
    createdAt: String(session.createdAt || new Date().toISOString()),
    updatedAt: String(session.updatedAt || session.createdAt || new Date().toISOString())
  };
}

export function isActiveAwakeningSessionV2(session) {
  return ACTIVE_STATUSES.has(normalizeAwakeningSessionV2(session)?.status);
}

export function answerAwakeningSessionV2(
  chapter,
  session,
  {
    selectedOptionId,
    attemptId = ""
  } = {},
  {
    now = new Date().toISOString()
  } = {}
) {
  const current = normalizeAwakeningSessionV2(session);
  if (!current || current.chapterId !== chapter?.id) {
    throw awakeningError("awakening_session_invalid", "这张记忆卡已经不可用。");
  }

  if (current.answer) {
    return {
      session: current,
      reviewSession: chapter.v2ReviewSession
        ? normalizeReviewSessionV2(chapter, chapter.v2ReviewSession, { now })
        : null,
      repeated: true
    };
  }

  const { unit, question } = findSessionQuestion(chapter, current);
  const optionId = String(selectedOptionId || "");
  if (!question.options.some((option) => option.id === optionId)) {
    throw awakeningError("awakening_option_invalid", "请选择一个有效答案。");
  }

  const result = optionId === question.correctOptionId ? "correct" : "incorrect";
  const currentReviewSession = chapter.v2ReviewSession
    ? normalizeReviewSessionV2(chapter, chapter.v2ReviewSession, { now })
    : createReviewSessionV2(chapter, { now });
  const reviewSession = answerQuestionV2(
    chapter,
    currentReviewSession,
    {
      unitId: unit.id,
      questionId: question.id,
      result,
      selectedOptionId: optionId
    },
    { now }
  );

  return {
    session: {
      ...current,
      status: "feedback",
      lifecycleState: result === "correct" ? "stable" : "fragile",
      answer: {
        attemptId: String(attemptId || `awakening-attempt-${current.id}`),
        selectedOptionId: optionId,
        correctOptionId: question.correctOptionId,
        result
      },
      answeredAt: now,
      updatedAt: now
    },
    reviewSession,
    repeated: false
  };
}

export function completeAwakeningSessionV2(
  session,
  {
    now = new Date().toISOString()
  } = {}
) {
  const current = normalizeAwakeningSessionV2(session);
  if (!current) {
    throw awakeningError("awakening_session_invalid", "这张记忆卡已经不可用。");
  }
  if (current.status === "completed") return current;
  if (!current.answer) {
    throw awakeningError("awakening_answer_required", "请先回答这张记忆卡。");
  }

  return {
    ...current,
    status: "completed",
    completedAt: now,
    updatedAt: now
  };
}

export function serializeAwakeningResponseV2(
  {
    chapter = null,
    session = null,
    availableCount = 0
  } = {}
) {
  const normalized = normalizeAwakeningSessionV2(session);
  if (!normalized || !chapter) {
    return {
      availableCount: Math.max(0, Number(availableCount) || 0),
      awakeningSession: null,
      card: null,
      feedback: null
    };
  }

  const { unit, question } = findSessionQuestion(chapter, normalized);
  const response = {
    availableCount: Math.max(0, Number(availableCount) || 0),
    awakeningSession: normalized,
    card: {
      id: `awakening-card-${normalized.id}`,
      sessionId: normalized.id,
      chapterId: chapter.id,
      chapterTitle: String(chapter.title || ""),
      unitId: unit.id,
      unitTitle: String(unit.title || ""),
      questionId: question.id,
      sourceType: normalized.sourceType,
      sourceAgeDays: normalized.sourceAgeDays,
      lifecycleState: normalized.lifecycleState,
      dueReason: normalized.dueReason,
      visualSeed: normalized.visualSeed,
      question: {
        id: question.id,
        type: "multiple_choice",
        stem: String(question.stem || ""),
        options: question.options.map((option) => ({
          id: String(option.id || ""),
          text: String(option.text || "")
        }))
      }
    },
    feedback: null
  };

  if (normalized.answer) {
    response.feedback = {
      result: normalized.answer.result,
      selectedOptionId: normalized.answer.selectedOptionId,
      correctOptionId: normalized.answer.correctOptionId,
      explanation: String(question.explanation || ""),
      sourceTitle: String(chapter.source?.title || chapter.title || ""),
      sourceExcerpt: sourceExcerptForQuestion(chapter, unit, question)
    };
  }

  return response;
}

function schedulingState(questionState, nowMs) {
  if (!questionState || questionState.status !== "answered") {
    return {
      priority: 3,
      dueReason: "new",
      lifecycleState: "new",
      answeredAtMs: 0
    };
  }

  const answeredAtMs = Date.parse(questionState.answeredAt || "");
  if (questionState.result !== "correct") {
    return {
      priority: 1,
      dueReason: "previous_wrong",
      lifecycleState: "fragile",
      answeredAtMs: Number.isFinite(answeredAtMs) ? answeredAtMs : 0
    };
  }

  if (!Number.isFinite(nowMs) || !Number.isFinite(answeredAtMs) || nowMs - answeredAtMs >= DAY_MS) {
    return {
      priority: 2,
      dueReason: "time_decay",
      lifecycleState: "due",
      answeredAtMs: Number.isFinite(answeredAtMs) ? answeredAtMs : 0
    };
  }

  return null;
}

function isReviewableChapter(chapter) {
  return chapter?.status === "completed"
    && Array.isArray(chapter.units)
    && chapter.units.length > 0;
}

function isSupportedQuestion(question) {
  return question?.type === "multiple_choice"
    && Array.isArray(question.options)
    && question.options.length >= 2
    && question.options.some((option) => option.id === question.correctOptionId);
}

function findSessionQuestion(chapter, session) {
  const unit = chapter?.units?.find((item) => item.id === session.unitId);
  const question = unit?.questions?.find((item) => item.id === session.questionId);
  if (!unit || !question || !isSupportedQuestion(question)) {
    throw awakeningError("awakening_question_missing", "这张记忆卡对应的题目已经不可用。");
  }
  return { unit, question };
}

function sourceExcerptForQuestion(chapter, unit, question) {
  if (unit.sourceAnchor?.quote) return String(unit.sourceAnchor.quote);
  const blockIds = Array.isArray(unit.sourceAnchor?.blockIds) ? unit.sourceAnchor.blockIds : [];
  const blockText = (chapter.source?.blocks || [])
    .filter((block) => blockIds.includes(block.id))
    .map((block) => String(block.text || "").trim())
    .filter(Boolean)
    .join("\n");
  if (blockText) return blockText;
  return String(
    chapter.source?.cleanedText
      || chapter.source?.extractedText
      || chapter.source?.rawText
      || ""
  ).trim().slice(0, 360);
}

function normalizeAnswer(answer) {
  if (!answer || typeof answer !== "object") return null;
  const result = answer.result === "correct" ? "correct" : "incorrect";
  return {
    attemptId: String(answer.attemptId || ""),
    selectedOptionId: String(answer.selectedOptionId || ""),
    correctOptionId: String(answer.correctOptionId || ""),
    result
  };
}

function normalizeDueReason(value) {
  if (["previous_wrong", "time_decay", "new", "resume"].includes(value)) return value;
  return "new";
}

function normalizeLifecycleState(value) {
  if (["new", "due", "fragile", "stable"].includes(value)) return value;
  return "new";
}

function normalizeSourceType(value) {
  const normalized = String(value || "").trim();
  return normalized || "text";
}

function nullableString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function ageInDays(value, nowMs) {
  const createdAtMs = Date.parse(value || "");
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdAtMs) / DAY_MS));
}

function stableHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function awakeningError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 422;
  return error;
}
