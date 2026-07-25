import Foundation

struct V2AwakeningSessionResponse: Decodable, Equatable {
    let availableCount: Int
    let awakeningSession: V2AwakeningSession?
    let card: V2AwakeningCard?
    let feedback: V2AwakeningFeedback?
    let chapter: V2BackendChapter?

    var hasActiveCard: Bool {
        guard let awakeningSession else { return false }
        return awakeningSession.status != "completed" && card != nil
    }
}

struct V2AwakeningSession: Decodable, Equatable {
    let schemaVersion: String
    let id: String
    let status: String
    let chapterId: String
    let unitId: String
    let questionId: String
    let dueReason: String
    let lifecycleState: String
    let sourceType: String
    let sourceAgeDays: Int
    let visualSeed: String
    let answer: V2AwakeningAnswer?
    let revealedAt: String?
    let answeredAt: String?
    let completedAt: String?
    let createdAt: String
    let updatedAt: String

    var lifecycleTitle: String {
        switch lifecycleState {
        case "fragile": "需加固"
        case "due": "待唤醒"
        case "stable": "已稳固"
        default: "新收下"
        }
    }

    var completionMessage: String {
        answer?.result == "correct"
            ? "这段记忆更清晰了"
            : "已经记下，下次再加固"
    }
}

struct V2AwakeningAnswer: Decodable, Equatable {
    let attemptId: String
    let selectedOptionId: String
    let correctOptionId: String
    let result: String
}

struct V2AwakeningCard: Decodable, Equatable {
    let id: String
    let sessionId: String
    let chapterId: String
    let chapterTitle: String
    let unitId: String
    let unitTitle: String
    let questionId: String
    let sourceType: String
    let sourceAgeDays: Int
    let lifecycleState: String
    let dueReason: String
    let visualSeed: String
    let question: V2AwakeningQuestion

    func reviewQuestion(feedback: V2AwakeningFeedback?) -> V2ReviewQuestionData {
        let correctIndex = feedback.flatMap { result in
            question.options.firstIndex { $0.id == result.correctOptionId }
        }
        return V2ReviewQuestionData(
            id: question.id,
            kind: .multipleChoice,
            title: "唤醒记忆",
            prompt: question.stem,
            options: question.options.map(\.text),
            correctOptionIndex: correctIndex,
            matchingPairs: [],
            feedback: feedback?.explanation ?? "",
            sourceAnchorId: nil,
            sourceExcerpt: feedback?.sourceExcerpt ?? ""
        )
    }
}

struct V2AwakeningQuestion: Decodable, Equatable {
    let id: String
    let type: String
    let stem: String
    let options: [V2BackendOption]
}

struct V2AwakeningFeedback: Decodable, Equatable {
    let result: String
    let selectedOptionId: String
    let correctOptionId: String
    let explanation: String
    let sourceTitle: String
    let sourceExcerpt: String
}

struct V2AwakeningAnswerRequest: Encodable {
    let selectedOptionId: String
    let attemptId: String
}

enum V2AwakeningFixture {
    static let homeResponse = V2AwakeningSessionResponse(
        availableCount: 3,
        awakeningSession: nil,
        card: nil,
        feedback: nil,
        chapter: nil
    )
    static var initialResponse: V2AwakeningSessionResponse {
        response(
            status: "revealed_unanswered",
            sessionId: "fixture-awakening-\(UUID().uuidString)"
        )
    }

    static func answeredResponse(
        selectedOptionId: String,
        from current: V2AwakeningSessionResponse?
    ) -> V2AwakeningSessionResponse {
        response(
            status: "feedback",
            selectedOptionId: selectedOptionId,
            sessionId: current?.awakeningSession?.id ?? "fixture-awakening-\(UUID().uuidString)"
        )
    }

    static func completedResponse(
        from current: V2AwakeningSessionResponse?
    ) -> V2AwakeningSessionResponse {
        response(
            status: "completed",
            selectedOptionId: current?.feedback?.selectedOptionId ?? "fixture-option-a",
            sessionId: current?.awakeningSession?.id ?? "fixture-awakening-\(UUID().uuidString)"
        )
    }

    private static func response(
        status: String,
        selectedOptionId: String? = nil,
        sessionId: String
    ) -> V2AwakeningSessionResponse {
        let isAnswered = selectedOptionId != nil
        let result = selectedOptionId == "fixture-option-a" ? "correct" : "incorrect"
        let answer = selectedOptionId.map {
            V2AwakeningAnswer(
                attemptId: "fixture-attempt",
                selectedOptionId: $0,
                correctOptionId: "fixture-option-a",
                result: result
            )
        }
        let feedback = isAnswered
            ? V2AwakeningFeedback(
                result: result,
                selectedOptionId: selectedOptionId ?? "",
                correctOptionId: "fixture-option-a",
                explanation: "AI 协作的稳定性依赖共享上下文。目标、约束和当前进展越清楚，AI 越能做出有用判断。",
                sourceTitle: "Anthropic 设计总监：AI Agents 协同工作",
                sourceExcerpt: "团队需要让项目目标、约束和当前进展对 AI 可见，才能把它真正接入协作流程。"
            )
            : nil

        return V2AwakeningSessionResponse(
            availableCount: 3,
            awakeningSession: V2AwakeningSession(
                schemaVersion: "v2_awakening_session_1",
                id: sessionId,
                status: status,
                chapterId: "v2-fixture",
                unitId: "unit-2",
                questionId: "u2-q1",
                dueReason: "time_decay",
                lifecycleState: result == "correct" && isAnswered ? "stable" : "due",
                sourceType: "article_link",
                sourceAgeDays: 83,
                visualSeed: "fixture-visual-seed",
                answer: answer,
                revealedAt: "2026-07-24T10:00:00.000Z",
                answeredAt: isAnswered ? "2026-07-24T10:00:03.000Z" : nil,
                completedAt: status == "completed" ? "2026-07-24T10:00:05.000Z" : nil,
                createdAt: "2026-07-24T10:00:00.000Z",
                updatedAt: "2026-07-24T10:00:05.000Z"
            ),
            card: V2AwakeningCard(
                id: "fixture-awakening-card-\(sessionId)",
                sessionId: sessionId,
                chapterId: "v2-fixture",
                chapterTitle: "AI Agents 协同工作",
                unitId: "unit-2",
                unitTitle: "让团队形成共享上下文",
                questionId: "u2-q1",
                sourceType: "article_link",
                sourceAgeDays: 83,
                lifecycleState: "due",
                dueReason: "time_decay",
                visualSeed: "fixture-visual-seed",
                question: V2AwakeningQuestion(
                    id: "u2-q1",
                    type: "multiple_choice",
                    stem: "如果团队想让 AI 更稳定地协助项目推进，最应该优先补足什么？",
                    options: [
                        V2BackendOption(id: "fixture-option-a", text: "让项目目标、约束和当前进展对 AI 可见"),
                        V2BackendOption(id: "fixture-option-b", text: "让每个人单独维护自己的提示词"),
                        V2BackendOption(id: "fixture-option-c", text: "减少团队成员之间的沟通"),
                        V2BackendOption(id: "fixture-option-d", text: "只在项目结束后让 AI 总结")
                    ]
                )
            ),
            feedback: feedback,
            chapter: nil
        )
    }
}
