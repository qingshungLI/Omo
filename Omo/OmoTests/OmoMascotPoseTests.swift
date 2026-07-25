import XCTest
@testable import Omo

/// Structural tests for the derived mascot poses.
/// Note: these run under Xcode; on Linux only static checks are performed.
final class OmoMascotPoseTests: XCTestCase {
    func testPoseCatalogIsCompleteAndStable() {
        XCTAssertEqual(
            OmoMascotPose.allCases.map(\.rawValue),
            ["shy", "heart", "approve", "confused", "dejected",
             "dazed", "stretch", "run", "farewell", "smirk"]
        )
    }

    func testEveryPoseMapsToDerivedAsset() {
        for pose in OmoMascotPose.allCases {
            XCTAssertEqual(pose.assetName, "OmoPose\(pose.rawValue.prefix(1).uppercased())\(pose.rawValue.dropFirst())")
        }
    }

    func testRecallMascotStateRawValuesRemainCompatible() {
        XCTAssertEqual(
            V2RecallMascotState.allCases.map(\.rawValue),
            ["idle", "reacting", "turning", "rummaging", "carrying",
             "watching", "acknowledging", "thinking", "sleeping", "farewell"]
        )
    }

    func testMemoryAssessmentMappingIsUnchanged() {
        XCTAssertEqual(V2MemoryAssessment.remembered.rawValue, "remembered")
        XCTAssertEqual(V2MemoryAssessment.fuzzy.rawValue, "fuzzy")
        XCTAssertEqual(V2MemoryAssessment.forgot.rawValue, "forgot")
    }
}
