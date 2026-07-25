import Foundation
import XCTest
@testable import Omo

final class V2RealCaptureFixtureLoaderTests: XCTestCase {
    func testV2DefaultReadsOnlyAnonymousCachedResponsesInStableOrder() throws {
        let firstCached = record(
            id: "shared-card",
            coreKnowledge: "first cached response wins"
        )
        let duplicateCached = record(
            id: "shared-card",
            coreKnowledge: "later cached response must not replace first"
        )
        let payload: [String: Any] = [
            "schemaVersion": "cached_ui_memory_cards_2",
            "anonymousCachedUIResponses": [
                cachedResponse(
                    cards: [firstCached, record(id: "cached-only")]
                ),
                cachedResponse(cards: [duplicateCached])
            ],
            "syntheticShowcase": [
                showcase(id: "showcase", card: record(id: "synthetic-only"))
            ]
        ]

        let snapshot = try V2RealCaptureFixtureLoader.decodeSnapshot(
            data: encoded(payload)
        )

        XCTAssertEqual(
            snapshot.cachedCards.map(\.id),
            ["shared-card", "cached-only"]
        )
        XCTAssertEqual(
            snapshot.cachedCards.first?.card.coreKnowledge,
            "first cached response wins"
        )
        XCTAssertTrue(snapshot.showcaseCards.isEmpty)
        XCTAssertEqual(snapshot.allCards.map(\.id), ["shared-card", "cached-only"])
    }

    func testV2ShowcaseRequiresExplicitFlagAndNeverOverridesReplay() throws {
        let payload: [String: Any] = [
            "schemaVersion": "cached_ui_memory_cards_2",
            "anonymousCachedUIResponses": [
                cachedResponse(cards: [record(id: "shared-card")])
            ],
            "syntheticShowcase": [
                showcase(id: "duplicate", card: record(id: "shared-card")),
                showcase(id: "visible", card: record(id: "synthetic-visible")),
                showcase(
                    id: "not-debug",
                    card: record(id: "synthetic-hidden"),
                    debugOnly: false
                )
            ]
        ]

        let snapshot = try V2RealCaptureFixtureLoader.decodeSnapshot(
            data: encoded(payload),
            includeSyntheticShowcase: true
        )

        XCTAssertEqual(snapshot.cachedCards.map(\.id), ["shared-card"])
        XCTAssertEqual(snapshot.showcaseCards.map(\.id), ["synthetic-visible"])
        XCTAssertEqual(
            snapshot.allCards.map(\.id),
            ["shared-card", "synthetic-visible"]
        )
    }

    func testUnknownSchemaThrowsExplicitError() throws {
        let data = try encoded(["schemaVersion": "future_snapshot_99"])

        XCTAssertThrowsError(
            try V2RealCaptureFixtureLoader.decodeSnapshot(data: data)
        ) { error in
            XCTAssertEqual(
                error as? V2RealCaptureFixtureLoader.FixtureError,
                .unsupportedSchema("future_snapshot_99")
            )
        }
    }

    func testV1CompatibilityIsExplicitAndUsesPresentationOnly() throws {
        let payload: [String: Any] = [
            "schemaVersion": "real_capture_ui_snapshot_1",
            "canonicalCaptures": [
                ["canonicalResponse": ["cards": [record(id: "canonical-v1")]]]
            ],
            "uiPresentationFixtures": [record(id: "legacy-presentation")]
        ]
        let data = try encoded(payload)

        XCTAssertThrowsError(
            try V2RealCaptureFixtureLoader.decodeSnapshot(data: data)
        )

        let snapshot = try V2RealCaptureFixtureLoader.decodeSnapshot(
            data: data,
            allowsLegacyV1: true
        )
        XCTAssertEqual(snapshot.cachedCards.map(\.id), ["legacy-presentation"])
        XCTAssertTrue(snapshot.showcaseCards.isEmpty)
    }

    private func encoded(_ payload: [String: Any]) throws -> Data {
        try JSONSerialization.data(
            withJSONObject: payload,
            options: [.sortedKeys]
        )
    }

    private func cachedResponse(cards: [[String: Any]]) -> [String: Any] {
        [
            "cards": cards
        ]
    }

    private func showcase(
        id: String,
        card: [String: Any],
        debugOnly: Bool = true
    ) -> [String: Any] {
        [
            "id": id,
            "debugOnly": debugOnly,
            "origin": "synthetic",
            "card": card
        ]
    }

    private func record(
        id: String,
        coreKnowledge: String? = nil
    ) -> [String: Any] {
        [
            "id": id,
            "state": "formal",
            "coreKnowledge": coreKnowledge ?? "knowledge \(id)",
            "recallCue": "recall \(id)",
            "hiddenSemantic": id,
            "explanation": "explanation \(id)",
            "sourceStatus": "verified",
            "disposition": "create_card",
            "rarity": "R",
            "rarityReason": "unit test",
            "sourceEvidenceIds": ["evidence-1"]
        ]
    }
}
