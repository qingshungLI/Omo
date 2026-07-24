import Foundation
import UIKit

struct V2CapturedMemoryCard: Identifiable, Equatable {
    let card: ImageFlowMemoryCard
    let screenshotData: Data

    var id: String { card.id }
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

struct V2ScreenshotDrawSession: Identifiable, Equatable {
    let id = UUID()
    let mode: V2ScreenshotDrawMode
    let cards: [V2CapturedMemoryCard]

    static func make(
        mode: V2ScreenshotDrawMode,
        from cards: [V2CapturedMemoryCard],
        shuffle: ([V2CapturedMemoryCard]) -> [V2CapturedMemoryCard] = { $0.shuffled() }
    ) -> V2ScreenshotDrawSession? {
        let uniqueCards = cards.reduce(into: [V2CapturedMemoryCard]()) { result, card in
            if !result.contains(where: { $0.id == card.id }) {
                result.append(card)
            }
        }
        guard !uniqueCards.isEmpty else { return nil }
        let shuffled = shuffle(uniqueCards)
        let selected = mode == .single ? Array(shuffled.prefix(1)) : Array(shuffled.prefix(10))
        return V2ScreenshotDrawSession(mode: mode, cards: selected)
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
