import Foundation
import UIKit

struct V2CapturedMemoryCard: Identifiable, Equatable {
    let card: ImageFlowMemoryCard
    let screenshotData: Data
    var schedule: ImageFlowReviewSchedule?
    let disposition: CaptureAnalysisDisposition
    var masteryStage: V2MemoryMasteryStage
    var successfulRecallCount: Int
    var reviewCount: Int
    var lastAssessment: V2MemoryAssessment?
    let capturedAt: Date
    let groupCardCount: Int
    let groupCardIndex: Int

    var id: String { card.id }

    var isFormalReviewCard: Bool {
        card.state == .formal && disposition == .createCard
    }

    var isUngradedFormalCard: Bool {
        isFormalReviewCard && card.rarity == nil
    }

    var isReadyForReview: Bool {
        isFormalReviewCard && card.rarity != nil
    }

    init(
        card: ImageFlowMemoryCard,
        screenshotData: Data,
        schedule: ImageFlowReviewSchedule? = nil,
        disposition: CaptureAnalysisDisposition? = nil,
        masteryStage: V2MemoryMasteryStage = .sealed,
        successfulRecallCount: Int = 0,
        reviewCount: Int = 0,
        lastAssessment: V2MemoryAssessment? = nil,
        capturedAt: Date = Date(),
        groupCardCount: Int = 1,
        groupCardIndex: Int = 0
    ) {
        let resolvedDisposition = disposition
            ?? (card.state == .formal ? .createCard : .archiveOnly)
        let isFormalReviewCard = card.state == .formal && resolvedDisposition == .createCard
        let isReadyForReview = isFormalReviewCard && card.rarity != nil
        self.card = card
        self.screenshotData = screenshotData
        self.schedule = isReadyForReview ? schedule : nil
        self.disposition = resolvedDisposition
        self.masteryStage = isReadyForReview ? masteryStage : .sealed
        self.successfulRecallCount = isReadyForReview ? successfulRecallCount : 0
        self.reviewCount = isReadyForReview ? reviewCount : 0
        self.lastAssessment = isReadyForReview ? lastAssessment : nil
        self.capturedAt = capturedAt
        self.groupCardCount = max(1, groupCardCount)
        self.groupCardIndex = min(
            max(0, groupCardIndex),
            max(0, groupCardCount - 1)
        )
    }

    init(record: CaptureMemoryCardRecord) {
        let isFormalReviewCard = record.memoryCard.state == .formal && record.disposition == .createCard
        let isReadyForReview = isFormalReviewCard && record.memoryCard.rarity != nil
        let groupedCards = (record.memoryCards ?? [])
            .reduce(into: [ImageFlowMemoryCard]()) { result, candidate in
                guard result.count < 3,
                      !result.contains(where: { $0.id == candidate.id }) else {
                    return
                }
                result.append(candidate)
            }
        let resolvedGroup: [ImageFlowMemoryCard]
        if groupedCards.isEmpty {
            resolvedGroup = [record.memoryCard]
        } else if groupedCards.contains(where: { $0.id == record.memoryCard.id }) {
            resolvedGroup = groupedCards
        } else {
            resolvedGroup = Array(([record.memoryCard] + groupedCards).prefix(3))
        }
        let persistedCaptureGroup = record.memoryCard.captureGroup ?? record.captureGroup
        let persistedCardIDs = (persistedCaptureGroup?.cardIds ?? [])
            .reduce(into: [String]()) { result, cardID in
                guard result.count < 3, !result.contains(cardID) else { return }
                result.append(cardID)
            }
        let persistedGroupCount = min(
            3,
            max(
                1,
                max(persistedCaptureGroup?.count ?? 0, persistedCardIDs.count)
            )
        )
        let persistedGroupIndex = persistedCardIDs.firstIndex(of: record.memoryCard.id)
            ?? min(
                max(0, persistedCaptureGroup?.index ?? 0),
                persistedGroupCount - 1
            )
        card = record.memoryCard
        screenshotData = Data()
        schedule = isReadyForReview ? record.schedule : nil
        disposition = record.disposition
        masteryStage = isReadyForReview ? (V2MemoryMasteryStage(rawServerValue: record.masteryStage) ?? .sealed) : .sealed
        successfulRecallCount = isReadyForReview ? (record.successfulRecallCount ?? 0) : 0
        reviewCount = isReadyForReview ? (record.reviewCount ?? 0) : 0
        lastAssessment = isReadyForReview ? record.lastAssessment.flatMap(V2MemoryAssessment.init(rawValue:)) : nil
        capturedAt = V2ScreenshotDateParser.date(from: record.capturedAt)
            ?? V2ScreenshotDateParser.date(from: record.memoryCard.createdAt)
            ?? Date()
        if persistedCaptureGroup != nil {
            groupCardCount = persistedGroupCount
            groupCardIndex = persistedGroupIndex
        } else {
            groupCardCount = resolvedGroup.count
            groupCardIndex = resolvedGroup.firstIndex(where: { $0.id == record.memoryCard.id }) ?? 0
        }
    }

    mutating func apply(
        _ assessment: V2MemoryAssessment,
        schedule updatedSchedule: ImageFlowReviewSchedule,
        serverMastery: CaptureMemoryCardAssessmentResponse.Mastery? = nil
    ) {
        guard isReadyForReview else {
            return
        }
        lastAssessment = assessment
        schedule = updatedSchedule
        if let serverMastery {
            masteryStage = V2MemoryMasteryStage(rawServerValue: serverMastery.after)
                ?? masteryStage.applying(assessment)
            successfulRecallCount = max(0, serverMastery.successfulRecallCount)
            reviewCount = max(0, serverMastery.reviewCount)
        } else {
            if assessment == .remembered {
                successfulRecallCount += 1
            }
            reviewCount += 1
            masteryStage = masteryStage.applying(assessment)
        }
    }

    /// Returns a copy with a deleted group member removed. The surviving card
    /// immediately re-normalizes its capture group (cardIds, count, index) so no
    /// surface can show stale multi-card metadata after a successful delete.
    func removingGroupMember(_ removedCardID: String) -> V2CapturedMemoryCard {
        guard removedCardID != id,
              groupCardCount > 1 || card.captureGroup != nil else {
            return self
        }
        var updatedCard = card
        var remainingCount = groupCardCount
        var remainingIndex = groupCardIndex
        if var group = updatedCard.captureGroup {
            let remainingIDs = group.cardIds.filter { $0 != removedCardID }
            group.cardIds = remainingIDs.isEmpty ? [updatedCard.id] : remainingIDs
            group.count = max(1, group.cardIds.count)
            group.index = max(0, group.cardIds.firstIndex(of: updatedCard.id) ?? 0)
            updatedCard.captureGroup = group
            remainingCount = group.count
            remainingIndex = group.index
        } else {
            remainingCount = max(1, groupCardCount - 1)
            remainingIndex = min(groupCardIndex, remainingCount - 1)
        }
        return V2CapturedMemoryCard(
            card: updatedCard,
            screenshotData: screenshotData,
            schedule: schedule,
            disposition: disposition,
            masteryStage: masteryStage,
            successfulRecallCount: successfulRecallCount,
            reviewCount: reviewCount,
            lastAssessment: lastAssessment,
            capturedAt: capturedAt,
            groupCardCount: remainingCount,
            groupCardIndex: remainingIndex
        )
    }

    /// Merges a freshly captured canonical payload with the progression held
    /// locally for the same canonical card id. A duplicate screenshot must never
    /// reset mastery, recall counts, capture time, or assessment; a schedule
    /// returned by the server is canonical and wins, otherwise the local one stays.
    func mergedWithLocalProgression(of existing: V2CapturedMemoryCard) -> V2CapturedMemoryCard {
        guard existing.id == id else {
            return self
        }
        return V2CapturedMemoryCard(
            card: card,
            screenshotData: screenshotData.isEmpty ? existing.screenshotData : screenshotData,
            schedule: schedule ?? existing.schedule,
            disposition: disposition,
            masteryStage: existing.masteryStage,
            successfulRecallCount: existing.successfulRecallCount,
            reviewCount: existing.reviewCount,
            lastAssessment: existing.lastAssessment,
            capturedAt: existing.capturedAt,
            groupCardCount: groupCardCount,
            groupCardIndex: groupCardIndex
        )
    }

    func reviewCycleKey(scheduleOverride: ImageFlowReviewSchedule? = nil) -> String {
        let nextReviewAt = scheduleOverride?.nextReviewAt
            ?? schedule?.nextReviewAt
            ?? "initial"
        return "\(id)-\(nextReviewAt)"
    }

    func matchesPersistedPresentation(
        cardID: String,
        reviewCycleKey: String
    ) -> Bool {
        cardID == id && reviewCycleKey == self.reviewCycleKey()
    }

    func isEligible(for pool: V2MemoryPool, now: Date = Date()) -> Bool {
        guard isReadyForReview else {
            return false
        }
        return switch pool {
        case .due:
            schedule?.isDue(at: now) ?? (lastAssessment == nil)
        case .timeCapsule:
            capturedAt <= now.addingTimeInterval(-30 * 24 * 60 * 60)
        case .fading:
            lastAssessment == .fuzzy || lastAssessment == .forgot
        }
    }
}

enum V2CaptureConfirmationOutcome: Equatable {
    case needsUserInput(
        message: String,
        requiredFields: [String],
        evidence: [CaptureMemoryCardConfirmationResponse.Evidence]
    )
    case confirmed(V2CapturedMemoryCard)
    case archived(V2CapturedMemoryCard?)
    case invalid(String)
}

enum V2CaptureConfirmationReducer {
    static func reduce(
        _ response: CaptureMemoryCardConfirmationResponse
    ) -> V2CaptureConfirmationOutcome {
        switch response.status {
        case .needsUserInput:
            return .needsUserInput(
                message: response.message ?? "请补充一条可从识别原文中核对的知识。",
                requiredFields: response.requiredFields ?? [],
                evidence: response.evidence ?? []
            )
        case .confirmed:
            guard let record = response.card else {
                return .invalid("服务端没有返回确认后的记忆卡。")
            }
            let captured = V2CapturedMemoryCard(record: record)
            guard captured.isReadyForReview else {
                return .invalid("确认结果尚未成为可复习的正式记忆卡。")
            }
            return .confirmed(captured)
        case .archived:
            return .archived(response.card.map(V2CapturedMemoryCard.init(record:)))
        }
    }
}

extension CaptureMemoryCardAssessmentResponse {
    func canonicalAssessment(fallback: V2MemoryAssessment) -> V2MemoryAssessment {
        V2MemoryAssessment(rawValue: assessment.assessment) ?? fallback
    }
}

enum V2ScreenshotPersistence {
    static let keys = [
        "recallo.v06.currentCardID",
        "recallo.v06.currentIndex",
        "recallo.v06.phase",
        "recallo.v06.revealCoverage",
        "recallo.v06.isRevealed",
        "recallo.v06.scratchPaths",
        "recallo.v06.coveredCells",
        "recallo.v06.assessedReviewCycles",
        "recallo.v06.presentationReviewCycleKey",
        "recallo.v06.assessment",
        "recallo.v06.masteryBefore",
        "recallo.v06.masteryAfter",
        "recallo.v06.scheduleNextReviewAt",
        "recallo.v06.scheduleIntervalDays",
        "recallo.v06.scheduleState",
        "recallo.v06.scheduleStatus"
    ]

    static func clear(from defaults: UserDefaults = .standard) {
        for key in keys {
            defaults.removeObject(forKey: key)
        }
    }
}

enum V2ScreenshotAnalysisState: Equatable {
    case idle
    case preparing
    case analyzing
    case generated(String)
    case failed(String)

    var isBusy: Bool {
        self == .preparing || self == .analyzing
    }
}

enum V2ScreenshotDrawMode: Equatable {
    case single
    case continuous
}

enum V2MemoryPool: String, CaseIterable, Hashable, Identifiable {
    case due
    case timeCapsule = "time_capsule"
    case fading

    var id: String { rawValue }

    var title: String {
        switch self {
        case .due: "今日待唤醒"
        case .timeCapsule: "时间胶囊"
        case .fading: "快要遗忘"
        }
    }

    var subtitle: String {
        switch self {
        case .due: "今天最值得再次想起"
        case .timeCapsule: "来自更久以前的自己"
        case .fading: "优先修复模糊的记忆"
        }
    }

    var symbolName: String {
        switch self {
        case .due: "sparkles"
        case .timeCapsule: "hourglass"
        case .fading: "circle.dashed"
        }
    }
}

enum V2MemoryAssessment: String, Equatable {
    case remembered
    case fuzzy
    case forgot
}

enum V2MemoryMasteryStage: Int, CaseIterable, Equatable {
    case sealed
    case awakened
    case solidified
    case engraved

    var title: String {
        switch self {
        case .sealed: "封存"
        case .awakened: "唤醒"
        case .solidified: "稳固"
        case .engraved: "铭刻"
        }
    }

    init?(rawServerValue: String?) {
        switch rawServerValue {
        case "sealed": self = .sealed
        case "awakened": self = .awakened
        case "solidified", "stable": self = .solidified
        case "engraved": self = .engraved
        default: return nil
        }
    }

    func applying(_ assessment: V2MemoryAssessment) -> V2MemoryMasteryStage {
        if self == .sealed {
            return .awakened
        }
        guard assessment == .remembered else {
            return self
        }
        switch self {
        case .sealed:
            return .awakened
        case .awakened:
            return .solidified
        case .solidified, .engraved:
            return .engraved
        }
    }
}

struct V2ScreenshotDrawSession: Identifiable, Equatable {
    let id = UUID()
    let mode: V2ScreenshotDrawMode
    let pool: V2MemoryPool
    let cards: [V2CapturedMemoryCard]

    static func make(
        mode: V2ScreenshotDrawMode,
        from cards: [V2CapturedMemoryCard],
        pool: V2MemoryPool = .due,
        now: Date = Date()
    ) -> V2ScreenshotDrawSession? {
        let eligibleCards = cards.filter { $0.isEligible(for: pool, now: now) }
        let uniqueCards = eligibleCards.reduce(into: [V2CapturedMemoryCard]()) { result, card in
            if !result.contains(where: { $0.id == card.id }) {
                result.append(card)
            }
        }
        guard !uniqueCards.isEmpty else { return nil }
        let orderedCards = ordered(uniqueCards, for: pool)
        let selected = mode == .single ? Array(orderedCards.prefix(1)) : Array(orderedCards.prefix(10))
        return V2ScreenshotDrawSession(mode: mode, pool: pool, cards: selected)
    }

    private static func ordered(
        _ cards: [V2CapturedMemoryCard],
        for pool: V2MemoryPool
    ) -> [V2CapturedMemoryCard] {
        cards.sorted { lhs, rhs in
            switch pool {
            case .due:
                let lhsDate = lhs.schedule?.nextReviewDate ?? lhs.capturedAt
                let rhsDate = rhs.schedule?.nextReviewDate ?? rhs.capturedAt
                if lhsDate != rhsDate { return lhsDate < rhsDate }
            case .timeCapsule:
                if lhs.capturedAt != rhs.capturedAt { return lhs.capturedAt < rhs.capturedAt }
            case .fading:
                let lhsPriority = fadingPriority(lhs.lastAssessment)
                let rhsPriority = fadingPriority(rhs.lastAssessment)
                if lhsPriority != rhsPriority { return lhsPriority < rhsPriority }
                if lhs.capturedAt != rhs.capturedAt { return lhs.capturedAt < rhs.capturedAt }
            }
            return lhs.id < rhs.id
        }
    }

    private static func fadingPriority(_ assessment: V2MemoryAssessment?) -> Int {
        switch assessment {
        case .forgot: 0
        case .fuzzy: 1
        default: 2
        }
    }
}

private enum V2ScreenshotDateParser {
    static func date(from value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractionalFormatter.date(from: value)
            ?? ISO8601DateFormatter().date(from: value)
    }
}

enum V2ScreenshotImageProcessor {
    static let maximumBytes = 5_500_000
    static let maximumEdge: CGFloat = 2_048

    static func prepare(_ data: Data) throws -> Data {
        guard let image = UIImage(data: data) else {
            throw V2ScreenshotImageError.invalidImage
        }
        let resized = resize(image, maximumEdge: maximumEdge)
        for quality in stride(from: 0.82, through: 0.42, by: -0.08) {
            if let encoded = resized.jpegData(compressionQuality: quality),
               encoded.count <= maximumBytes {
                return encoded
            }
        }
        guard let encoded = resized.jpegData(compressionQuality: 0.32),
              encoded.count <= maximumBytes else {
            throw V2ScreenshotImageError.tooLarge
        }
        return encoded
    }

    private static func resize(_ image: UIImage, maximumEdge: CGFloat) -> UIImage {
        let size = image.size
        let longestEdge = max(size.width, size.height)
        guard longestEdge > maximumEdge, longestEdge > 0 else { return image }
        let scale = maximumEdge / longestEdge
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        // JPEG drops UIImage's point scale metadata. Render at 1x so the encoded
        // pixel edge, not only the point-space edge, stays within the upload cap.
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}

enum V2ScreenshotImageError: LocalizedError {
    case invalidImage
    case tooLarge

    var errorDescription: String? {
        switch self {
        case .invalidImage:
            "无法读取这张图片，请换一张截图。"
        case .tooLarge:
            "图片压缩后仍然过大，请先裁剪再试。"
        }
    }
}

enum V2ScreenshotAnalysisError: LocalizedError {
    case missingMemoryCard

    var errorDescription: String? {
        "服务器没有返回可用的记忆卡，请稍后重试。"
    }
}
