#if DEBUG
import Foundation

enum V2RealCaptureFixtureLoader {
    struct SnapshotCards {
        let cachedCards: [V2CapturedMemoryCard]
        let showcaseCards: [V2CapturedMemoryCard]

        var allCards: [V2CapturedMemoryCard] {
            cachedCards + showcaseCards
        }

        static let empty = SnapshotCards(cachedCards: [], showcaseCards: [])
    }

    struct LoadOptions: Equatable {
        enum SnapshotSource: Equatable {
            case currentV2
            case legacyV1
        }

        let source: SnapshotSource
        let includeSyntheticShowcase: Bool

        var resourceName: String {
            switch source {
            case .currentV2:
                "cached-ui-memory-cards-v2"
            case .legacyV1:
                "real-capture-ui-snapshot-v1"
            }
        }

        static func processDefault(
            processInfo: ProcessInfo = .processInfo
        ) -> LoadOptions {
            let arguments = processInfo.arguments
            let environment = processInfo.environment
            let usesLegacyV1 = [
                "-OmoUseLegacyRealCaptureFixtureV1",
                "-RecalloUseLegacyRealCaptureFixtureV1",
                "-ShibeiUseLegacyRealCaptureFixtureV1"
            ].contains { arguments.contains($0) }
                || environment["OMO_USE_LEGACY_REAL_CAPTURE_FIXTURE_V1"] == "1"
                || environment["RECALLO_USE_LEGACY_REAL_CAPTURE_FIXTURE_V1"] == "1"
                || environment["SHIBEI_USE_LEGACY_REAL_CAPTURE_FIXTURE_V1"] == "1"
            let includesShowcase = [
                "-OmoUseSyntheticShowcase",
                "-RecalloUseSyntheticShowcase",
                "-ShibeiUseSyntheticShowcase"
            ].contains { arguments.contains($0) }
                || environment["OMO_USE_SYNTHETIC_SHOWCASE"] == "1"
                || environment["RECALLO_USE_SYNTHETIC_SHOWCASE"] == "1"
                || environment["SHIBEI_USE_SYNTHETIC_SHOWCASE"] == "1"
            return LoadOptions(
                source: usesLegacyV1 ? .legacyV1 : .currentV2,
                includeSyntheticShowcase: includesShowcase
            )
        }
    }

    enum FixtureError: Error, Equatable, LocalizedError {
        case unsupportedSchema(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedSchema(let schemaVersion):
                "Unsupported cached UI fixture schema: \(schemaVersion)"
            }
        }
    }

    private struct SchemaEnvelope: Decodable {
        let schemaVersion: String
    }

    private struct V2SnapshotPayload: Decodable {
        let anonymousCachedUIResponses: [CaptureMemoryCardsResponse]
        let syntheticShowcase: [SyntheticShowcase]?
    }

    private struct SyntheticShowcase: Decodable {
        let debugOnly: Bool
        let card: CaptureMemoryCardRecord
    }

    private struct V1SnapshotPayload: Decodable {
        let uiPresentationFixtures: [CaptureMemoryCardRecord]
    }

    static func load(
        bundle: Bundle = .main,
        options: LoadOptions = .processDefault()
    ) -> SnapshotCards {
        guard let url = bundle.url(
            forResource: options.resourceName,
            withExtension: "json"
        ) else {
            record("Missing DEBUG fixture resource \(options.resourceName).json")
            return .empty
        }

        do {
            let data = try Data(contentsOf: url)
            return try decodeSnapshot(
                data: data,
                includeSyntheticShowcase: options.includeSyntheticShowcase,
                allowsLegacyV1: options.source == .legacyV1
            )
        } catch {
            record(
                "Failed to load \(options.resourceName).json: " +
                    String(describing: error)
            )
            return .empty
        }
    }

    static func decodeSnapshot(
        data: Data,
        includeSyntheticShowcase: Bool = false,
        allowsLegacyV1: Bool = false
    ) throws -> SnapshotCards {
        let decoder = JSONDecoder()
        let envelope = try decoder.decode(SchemaEnvelope.self, from: data)

        switch envelope.schemaVersion {
        case "cached_ui_memory_cards_2":
            let payload = try decoder.decode(V2SnapshotPayload.self, from: data)
            return makeV2SnapshotCards(
                payload: payload,
                includeSyntheticShowcase: includeSyntheticShowcase
            )
        case "real_capture_ui_snapshot_1" where allowsLegacyV1:
            let payload = try decoder.decode(V1SnapshotPayload.self, from: data)
            return SnapshotCards(
                cachedCards: unique(
                    payload.uiPresentationFixtures.map(
                        V2CapturedMemoryCard.init(record:)
                    )
                ),
                showcaseCards: []
            )
        default:
            throw FixtureError.unsupportedSchema(envelope.schemaVersion)
        }
    }

    private static func makeV2SnapshotCards(
        payload: V2SnapshotPayload,
        includeSyntheticShowcase: Bool
    ) -> SnapshotCards {
        let cachedCards = unique(
            payload.anonymousCachedUIResponses
                .flatMap(\.cards)
                .map(V2CapturedMemoryCard.init(record:))
        )
        guard includeSyntheticShowcase else {
            return SnapshotCards(
                cachedCards: cachedCards,
                showcaseCards: []
            )
        }

        let cachedIDs = Set(cachedCards.map(\.id))
        let showcaseCards = unique(
            (payload.syntheticShowcase ?? [])
                .filter(\.debugOnly)
                .map(\.card)
                .map(V2CapturedMemoryCard.init(record:))
        )
        .filter { !cachedIDs.contains($0.id) }
        return SnapshotCards(
            cachedCards: cachedCards,
            showcaseCards: showcaseCards
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

    private static func record(_ message: String) {
        debugPrint("[Omo][Fixture] \(message)")
    }
}
#endif
