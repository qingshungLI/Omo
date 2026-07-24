import UIKit
import Vision

struct ImageOCRResult: Sendable {
    let title: String
    let creator: String
    let keyText: String
    let lines: [String]
    let latencyMilliseconds: Int
}

enum ImageOCR {
    static func recognize(_ image: UIImage) async throws -> ImageOCRResult {
        guard let cgImage = image.cgImage else { throw ImageOCRError.invalidImage }
        let started = ContinuousClock.now
        let observations = try await performRequest(cgImage)
        let lines = observations
            .compactMap { $0.topCandidates(1).first?.string.cleanedOCRLine }
            .filter { !$0.isEmpty }
        let title = selectTitle(from: lines)
        let creator = selectCreator(from: lines, title: title)
        let keyText = [creator, title].filter { !$0.isEmpty }.joined(separator: " ")
        let elapsed = ContinuousClock.now - started
        let duration = elapsed.components
        return ImageOCRResult(
            title: title,
            creator: creator,
            keyText: keyText,
            lines: lines,
            latencyMilliseconds: Int(duration.seconds * 1_000) + Int(duration.attoseconds / 1_000_000_000_000_000)
        )
    }

    private static func performRequest(_ image: CGImage) async throws -> [VNRecognizedTextObservation] {
        try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: request.results as? [VNRecognizedTextObservation] ?? [])
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["zh-Hans", "en-US"]
            request.minimumTextHeight = 0.012
            // The title and creator are in the upper content area of social screenshots.
            request.regionOfInterest = CGRect(x: 0, y: 0.30, width: 1, height: 0.70)
            do {
                try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    private static func selectTitle(from lines: [String]) -> String {
        let candidates = lines.filter { line in
            line.count >= 6 && !isUI(line) && (line.contains("【") || line.contains("Top") || line.contains("年度") || line.contains("资本") || line.contains("博弈") || line.contains("策略") || line.contains("盘点"))
        }
        return candidates.max { lhs, rhs in titleScore(lhs) < titleScore(rhs) } ?? lines.first(where: { !$0.isEmpty && !isUI($0) }) ?? ""
    }

    private static func selectCreator(from lines: [String], title: String) -> String {
        if let known = lines.first(where: { $0.contains("巫师财经") }) { return known }
        let titleIndex = lines.firstIndex(of: title) ?? lines.count
        return lines.prefix(titleIndex).last(where: { line in
            let count = line.filter { $0.isChinese }.count
            return count >= 2 && count <= 12 && !isUI(line)
        }) ?? ""
    }

    private static func titleScore(_ line: String) -> Int {
        (line.contains("【") ? 30 : 0) + (line.contains("Top") ? 15 : 0) + line.filter { $0.isChinese }.count
    }

    private static func isUI(_ line: String) -> Bool {
        line.range(of: "^(简介|评论|充电|已关注|分享|收藏|不喜欢|正在看|播放|弹幕|点赞|广告|立即打开|[0-9: .]+)$", options: .regularExpression) != nil
    }
}

enum ImageOCRError: Error {
    case invalidImage
}

private extension String {
    var cleanedOCRLine: String {
        replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private extension Character {
    var isChinese: Bool {
        unicodeScalars.contains { (0x4E00...0x9FFF).contains($0.value) }
    }
}
