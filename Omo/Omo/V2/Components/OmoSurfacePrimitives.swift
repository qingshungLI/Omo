import SwiftUI

/// Semantic depth for Omo's paper surfaces. Text-bearing surfaces always
/// start with an opaque cream fill; grain is a low-contrast decorative layer.
enum OmoSurfaceLevel {
    case flat
    case raised
    case floating

    var shadow: V2ShadowSpec? {
        switch self {
        case .flat:
            nil
        case .raised:
            V2ShadowSpec(
                color: Color(hex: 0x807650).opacity(0.12),
                radius: 5,
                x: 0,
                y: 3
            )
        case .floating:
            V2ShadowSpec(
                color: Color(hex: 0x6F6644).opacity(0.16),
                radius: 10,
                x: 0,
                y: 6
            )
        }
    }

    var grainOpacity: Double {
        switch self {
        case .flat: 0.018
        case .raised: 0.024
        case .floating: 0.028
        }
    }
}

private struct OmoPaperSurfaceModifier: ViewModifier {
    let level: OmoSurfaceLevel
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content.background {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(V2Color.surfaceCream)
                .overlay {
                    OmoPaperGrain()
                        .opacity(level.grainOpacity)
                        .clipShape(
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        )
                }
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(Color.white.opacity(0.72), lineWidth: 1)
                        .padding(1)
                }
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(V2Color.borderSoftGreen.opacity(0.72), lineWidth: 0.8)
                }
                .modifier(OmoOptionalShadowModifier(shadow: level.shadow))
        }
    }
}

private struct OmoOptionalShadowModifier: ViewModifier {
    let shadow: V2ShadowSpec?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let shadow {
            content.shadow(
                color: shadow.color,
                radius: shadow.radius,
                x: shadow.x,
                y: shadow.y
            )
        } else {
            content
        }
    }
}

/// Static, deterministic paper flecks. The Canvas never animates and remains
/// accessibility-hidden, so it adds texture without visual noise or narration.
private struct OmoPaperGrain: View {
    var body: some View {
        Canvas(opaque: false, rendersAsynchronously: true) { context, size in
            guard size.width > 0, size.height > 0 else { return }
            var seed: UInt64 = 0x0A0D_2026
            for index in 0..<54 {
                seed = seed &* 2_862_933_555_777_941_757 &+ 3_037_000_493
                let x = CGFloat(seed % 10_000) / 10_000 * size.width
                seed = seed &* 2_862_933_555_777_941_757 &+ 3_037_000_493
                let y = CGFloat(seed % 10_000) / 10_000 * size.height
                let diameter: CGFloat = index.isMultiple(of: 7) ? 1.5 : 0.9
                let fleck = Path(
                    ellipseIn: CGRect(
                        x: x,
                        y: y,
                        width: diameter,
                        height: diameter
                    )
                )
                context.fill(fleck, with: .color(V2Color.textPrimary))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct OmoPressableButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.975 : 1)
            .offset(y: configuration.isPressed && !reduceMotion ? 1 : 0)
            .opacity(configuration.isPressed && reduceMotion ? 0.84 : 1)
            .animation(
                reduceMotion
                    ? .linear(duration: 0.10)
                    : .spring(response: 0.24, dampingFraction: 0.78),
                value: configuration.isPressed
            )
    }
}

extension View {
    func omoPaperSurface(
        _ level: OmoSurfaceLevel = .raised,
        cornerRadius: CGFloat = V2Radius.large
    ) -> some View {
        modifier(OmoPaperSurfaceModifier(level: level, cornerRadius: cornerRadius))
    }
}
