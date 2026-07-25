import SwiftUI

/// View-only mascot poses derived from the approved Omo pose sheet.
///
/// Each case maps to a 512x512 transparent PNG imageset (`OmoPose*`) with a
/// uniform character height and a bottom-center anchor, so poses stay aligned
/// at both 98pt and 164pt display sizes.
///
/// This enum is intentionally *not* persisted anywhere: `V2RecallMascotState`
/// remains the only persisted mascot state and its raw values are unchanged.
enum OmoMascotPose: String, CaseIterable {
    case shy
    case heart
    case approve
    case confused
    case dejected
    case dazed
    case stretch
    case run
    case farewell
    case smirk

    var assetName: String {
        switch self {
        case .shy: "OmoPoseShy"
        case .heart: "OmoPoseHeart"
        case .approve: "OmoPoseApprove"
        case .confused: "OmoPoseConfused"
        case .dejected: "OmoPoseDejected"
        case .dazed: "OmoPoseDazed"
        case .stretch: "OmoPoseStretch"
        case .run: "OmoPoseRun"
        case .farewell: "OmoPoseFarewell"
        case .smirk: "OmoPoseSmirk"
        }
    }
}

/// Renders one derived mascot pose and cross-fades between poses.
///
/// Motion policy: pose changes are always static swaps with a short fade
/// (120ms under Reduce Motion, 180ms otherwise); richer motion is applied by
/// the call site through offset/rotation/scale modifiers, not by this view.
/// The view is accessibility-hidden; the nearest functional ancestor provides
/// the VoiceOver description.
struct OmoMascotPoseView: View {
    let pose: OmoMascotPose
    let reduceMotion: Bool

    var body: some View {
        ZStack {
            Image(pose.assetName)
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
                .id(pose.rawValue)
                .transition(.opacity)
        }
        .animation(
            .easeOut(duration: reduceMotion ? 0.12 : 0.18),
            value: pose
        )
        .accessibilityHidden(true)
    }
}
