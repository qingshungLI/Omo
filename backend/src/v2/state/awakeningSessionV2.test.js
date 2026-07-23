import assert from "node:assert/strict";
import test from "node:test";

import {
  answerAwakeningSessionV2,
  completeAwakeningSessionV2,
  createAwakeningSessionV2,
  isActiveAwakeningSessionV2,
  listAwakeningCandidatesV2,
  serializeAwakeningResponseV2
} from "./awakeningSessionV2.js";

const NOW = "2026-07-24T10:00:00.000Z";

test("selects an incorrect memory before a new memory", () => {
  const chapter = fixtureChapter();
  chapter.v2ReviewSession = {
    ...fixtureReviewSession(),
    questionStates: {
      "q-incorrect": {
        status: "answered",
        result: "incorrect",
        selectedOptionId: "b",
        matchedPairs: [],
        lockedPairIds: [],
        feedbackVisible: true,
        answeredAt: "2026-07-24T09:00:00.000Z"
      }
    }
  };

  const candidates = listAwakeningCandidatesV2([chapter], {
    deviceId: "device-test",
    now: NOW
  });

  assert.equal(candidates[0].question.id, "q-incorrect");
  assert.equal(candidates[0].dueReason, "previous_wrong");
  assert.equal(candidates[0].lifecycleState, "fragile");
});

test("keeps recently-correct memories quiet until the 24 hour threshold", () => {
  const chapter = fixtureChapter();
  chapter.v2ReviewSession = {
    ...fixtureReviewSession(),
    questionStates: {
      "q-new": {
        status: "answered",
        result: "correct",
        selectedOptionId: "a",
        matchedPairs: [],
        lockedPairIds: [],
        feedbackVisible: true,
        answeredAt: "2026-07-24T09:30:00.000Z"
      },
      "q-incorrect": {
        status: "answered",
        result: "correct",
        selectedOptionId: "a",
        matchedPairs: [],
        lockedPairIds: [],
        feedbackVisible: true,
        answeredAt: "2026-07-23T09:00:00.000Z"
      }
    }
  };

  const candidates = listAwakeningCandidatesV2([chapter], {
    deviceId: "device-test",
    now: NOW
  });

  assert.deepEqual(candidates.map((candidate) => candidate.question.id), ["q-incorrect"]);
  assert.equal(candidates[0].dueReason, "time_decay");
  assert.equal(candidates[0].lifecycleState, "due");
});

test("creates one locked session and hides answer evidence before answering", () => {
  const chapter = fixtureChapter();
  const created = createAwakeningSessionV2([chapter], {
    deviceId: "device-test",
    now: NOW,
    sessionId: "awakening-test"
  });
  chapter.v2AwakeningSession = created.session;

  const response = serializeAwakeningResponseV2({
    chapter,
    session: created.session,
    availableCount: created.availableCount
  });

  assert.equal(response.awakeningSession.id, "awakening-test");
  assert.equal(response.awakeningSession.status, "revealed_unanswered");
  assert.equal(response.card.question.type, "multiple_choice");
  assert.equal(response.card.question.correctOptionId, undefined);
  assert.equal(response.feedback, null);
  assert.equal(isActiveAwakeningSessionV2(response.awakeningSession), true);
});

test("answers server-side, updates shared review state, and is idempotent", () => {
  const chapter = fixtureChapter();
  const created = createAwakeningSessionV2([chapter], {
    deviceId: "device-test",
    now: NOW,
    sessionId: "awakening-test"
  });
  const selectedQuestion = created.session.questionId;
  const selectedUnit = chapter.units.find((unit) => unit.id === created.session.unitId);
  const question = selectedUnit.questions.find((item) => item.id === selectedQuestion);

  const first = answerAwakeningSessionV2(
    chapter,
    created.session,
    {
      selectedOptionId: question.correctOptionId,
      attemptId: "attempt-1"
    },
    { now: NOW }
  );
  chapter.v2ReviewSession = first.reviewSession;

  assert.equal(first.session.status, "feedback");
  assert.equal(first.session.answer.result, "correct");
  assert.equal(first.reviewSession.questionStates[selectedQuestion].result, "correct");

  const repeated = answerAwakeningSessionV2(
    chapter,
    first.session,
    {
      selectedOptionId: "not-the-first-answer",
      attemptId: "attempt-2"
    },
    { now: "2026-07-24T10:00:01.000Z" }
  );

  assert.equal(repeated.repeated, true);
  assert.equal(repeated.session.answer.attemptId, "attempt-1");
  assert.equal(repeated.session.answer.result, "correct");
});

test("only completes after an answer and exposes feedback evidence", () => {
  const chapter = fixtureChapter();
  const created = createAwakeningSessionV2([chapter], {
    deviceId: "device-test",
    now: NOW,
    sessionId: "awakening-test"
  });

  assert.throws(
    () => completeAwakeningSessionV2(created.session, { now: NOW }),
    /请先回答/
  );

  const answered = answerAwakeningSessionV2(
    chapter,
    created.session,
    {
      selectedOptionId: "b",
      attemptId: "attempt-1"
    },
    { now: NOW }
  );
  const completed = completeAwakeningSessionV2(answered.session, {
    now: "2026-07-24T10:00:02.000Z"
  });
  const response = serializeAwakeningResponseV2({
    chapter,
    session: completed,
    availableCount: 1
  });

  assert.equal(completed.status, "completed");
  assert.equal(response.feedback.result, "incorrect");
  assert.equal(response.feedback.correctOptionId, "a");
  assert.match(response.feedback.sourceExcerpt, /证据片段/);
});

function fixtureChapter() {
  return {
    schemaVersion: "v2_review_path_1",
    id: "chapter-test",
    title: "测试章节",
    status: "completed",
    displayStatusText: "已生成",
    createdAt: "2026-07-20T10:00:00.000Z",
    source: {
      type: "article_link",
      platform: "web",
      url: "https://example.com/test",
      title: "测试来源",
      rawText: "这是支持正确答案的证据片段。",
      cleanedText: "这是支持正确答案的证据片段。",
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          text: "这是支持正确答案的证据片段。"
        }
      ]
    },
    summaryCard: {
      text: "测试摘要"
    },
    units: [
      {
        id: "unit-1",
        order: 1,
        title: "测试单元",
        nodeLabel: "测试核心",
        shortSummary: "这是测试单元的一句话总结。",
        detailSummary: "这是测试单元的完整描述，用于验证抽卡作答会同步复习状态。",
        sourceAnchor: {
          id: "anchor-1",
          blockIds: ["block-1"],
          quote: "这是支持正确答案的证据片段。"
        },
        overview: {
          text: "测试概览"
        },
        questions: [
          {
            id: "q-new",
            type: "multiple_choice",
            stem: "新的问题？",
            options: [
              { id: "a", text: "正确" },
              { id: "b", text: "错误一" },
              { id: "c", text: "错误二" },
              { id: "d", text: "错误三" }
            ],
            correctOptionId: "a",
            correctUnderstanding: "应当选择正确选项。",
            misconception: "把无证据选项当作正确答案。",
            explanation: "正确解释",
            sourceAnchorId: "anchor-1"
          },
          {
            id: "q-incorrect",
            type: "multiple_choice",
            stem: "上次答错的问题？",
            options: [
              { id: "a", text: "正确" },
              { id: "b", text: "错误一" },
              { id: "c", text: "错误二" },
              { id: "d", text: "错误三" }
            ],
            correctOptionId: "a",
            correctUnderstanding: "应当选择正确选项。",
            misconception: "重复上一次的错误理解。",
            explanation: "正确解释",
            sourceAnchorId: "anchor-1"
          }
        ],
        summary: {
          title: "单元完成",
          text: "完成"
        }
      }
    ],
    chapterSummary: {
      title: "完成",
      statsText: "共 1 个单元，2 道题",
      encouragementText: "继续保持。"
    },
    generationMeta: {
      currentStage: "completed",
      stages: []
    }
  };
}

function fixtureReviewSession() {
  return {
    schemaVersion: "v2_review_session_1",
    id: "review-session-test",
    chapterId: "chapter-test",
    status: "active",
    currentCard: {
      type: "chapter_overview",
      chapterId: "chapter-test"
    },
    questionStates: {},
    completedStepIds: [],
    needsReviewQuestionIds: [],
    sourceRoute: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null
  };
}
