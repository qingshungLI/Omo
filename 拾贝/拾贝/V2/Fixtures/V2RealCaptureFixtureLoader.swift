#if DEBUG
import Foundation

enum V2RealCaptureFixtureLoader {
    struct SnapshotCards {
        let canonicalCards: [V2CapturedMemoryCard]
        let presentationCards: [V2CapturedMemoryCard]

        var allCards: [V2CapturedMemoryCard] {
            presentationCards + canonicalCards
        }
    }

    private struct SnapshotPayload: Decodable {
        let canonicalCaptures: [CanonicalCapture]
        let uiPresentationFixtures: [CaptureMemoryCardRecord]
    }

    private struct CanonicalCapture: Decodable {
        let canonicalResponse: CaptureMemoryCardsResponse
    }

    static func load(bundle: Bundle = .main) -> SnapshotCards {
        guard let url = bundle.url(
            forResource: "real-capture-ui-snapshot-v1",
            withExtension: "json"
        ),
        let data = try? Data(contentsOf: url),
        let snapshot = try? decodeSnapshot(data: data) else {
            return SnapshotCards(canonicalCards: [], presentationCards: [])
        }
        return snapshot
    }

    static func decodeSnapshot(data: Data) throws -> SnapshotCards {
        let payload = try JSONDecoder().decode(SnapshotPayload.self, from: data)
        let canonicalCards = payload.canonicalCaptures
            .flatMap(\.canonicalResponse.cards)
            .map(V2CapturedMemoryCard.init(record:))
        let presentationCards = payload.uiPresentationFixtures
            .map(V2CapturedMemoryCard.init(record:))
        return SnapshotCards(
            canonicalCards: unique(canonicalCards),
            presentationCards: unique(presentationCards)
        )
    }

    private static func unique(
        _ cards: [V2CapturedMemoryCard]
    ) -> [V2CapturedMemoryCard] {
        cards.reduce(into: []) { result, card in
            guard !result.contains(where: { $0.id == card.id }) else {
                return
            }
            result.append(card)
        }
    }
}
#endif
