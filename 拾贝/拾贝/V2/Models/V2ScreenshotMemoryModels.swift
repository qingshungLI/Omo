import Foundation
import UIKit

struct V2CapturedMemoryCard: Identifiable, Equatable {
    let card: ImageFlowMemoryCard
    let screenshotData: Data
    var masteryStage: V2MemoryMasteryStage
    var successfulRecallCount: Int
    var lastAssessment: V2MemoryAssessment?
    let capturedAt: Date

    var id: String { card.id }

    init(
        card: ImageFlowMemoryCard,
        screenshotData: Data,
        masteryStage: V2MemoryMasteryStage = .sealed,
        successfulRecallCount: Int = 0,
        lastAssessment: V2MemoryAssessment? = nil,
        capturedAt: Date = Date()
    ) {
        self.card = card
        self.screenshotData = screenshotData
        self.masteryStage = masteryStage
        self.successfulRecallCount = successfulRecallCount
        self.lastAssessment = lastAssessment
        self.capturedAt = capturedAt
    }

    mutating func apply(_ assessment: V2MemoryAssessment) {
        lastAssessment = assessment
        if assessment == .remembered {
            successfulRecallCount += 1
        }
        masteryStage = masteryStage.applying(assessment)
    }

    func isEligible(for pool: V2MemoryPool, now: Date = Date()) -> Bool {
        switch pool {
        case .due:
            true
        case .timeCapsule:
            capturedAt <= now.addingTimeInterval(-30 * 24 * 60 * 60)
        case .fading:
            lastAssessment == .fuzzy || lastAssessment == .forgot
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
        now: Date = Date(),
        shuffle: ([V2CapturedMemoryCard]) -> [V2CapturedMemoryCard] = { $0.shuffled() }
    ) -> V2ScreenshotDrawSession? {
        let eligibleCards = cards.filter { $0.isEligible(for: pool, now: now) }
        let uniqueCards = eligibleCards.reduce(into: [V2CapturedMemoryCard]()) { result, card in
            if !result.contains(where: { $0.id == card.id }) {
                result.append(card)
            }
        }
        guard !uniqueCards.isEmpty else { return nil }
        let shuffled = shuffle(uniqueCards)
        let selected = mode == .single ? Array(shuffled.prefix(1)) : Array(shuffled.prefix(10))
        return V2ScreenshotDrawSession(mode: mode, pool: pool, cards: selected)
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
        let renderer = UIGraphicsImageRenderer(size: targetSize)
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
