import SwiftUI

struct V2RarityVisualStyle {
    let accent: Color
    let surfaceTint: Color
    let innerStrokeOpacity: Double
    let fiberOpacity: Double

    init(_ rarity: ImageFlowMemoryCard.Rarity) {
        switch rarity {
        case .r:
            accent = Color(hex: 0x5F5C57)
            surfaceTint = Color(hex: 0x5F5C57).opacity(0.05)
            innerStrokeOpacity = 0
            fiberOpacity = 0
        case .sr:
            accent = Color(hex: 0xD9785F)
            surfaceTint = Color(hex: 0xD9785F).opacity(0.07)
            innerStrokeOpacity = 0.32
            fiberOpacity = 0
        case .ssr:
            accent = Color(hex: 0xB67B25)
            surfaceTint = Color(hex: 0xB67B25).opacity(0.09)
            innerStrokeOpacity = 0.22
            fiberOpacity = 0.16
        }
    }
}

struct V2RarityBadge: View {
    let rarity: ImageFlowMemoryCard.Rarity
    var compact = false

    private var style: V2RarityVisualStyle {
        V2RarityVisualStyle(rarity)
    }

    var body: some View {
        Text(rarity.rawValue)
            .font(.system(size: compact ? 12 : 15, weight: .heavy, design: .rounded))
            .foregroundStyle(style.accent)
            .padding(.horizontal, compact ? 9 : 12)
            .padding(.vertical, compact ? 5 : 7)
            .background(
                Capsule()
                    .fill(style.surfaceTint)
                    .overlay(
                        Capsule()
                            .stroke(style.accent.opacity(0.48), lineWidth: 1)
                    )
            )
            .accessibilityLabel("知识核心潜力 \(rarity.rawValue)，不代表掌握程度")
    }
}

struct V2UngradedRarityBadge: View {
    var compact = false

    var body: some View {
        Text("待定级")
            .font(.system(size: compact ? 12 : 14, weight: .semibold))
            .foregroundStyle(V2Color.textMuted)
            .padding(.horizontal, compact ? 9 : 11)
            .padding(.vertical, compact ? 5 : 7)
            .background(
                Capsule()
                    .fill(V2Color.textMuted.opacity(0.08))
                    .overlay(
                        Capsule()
                            .stroke(V2Color.textMuted.opacity(0.3), lineWidth: 1)
                    )
            )
            .accessibilityLabel("知识等级待确认，暂不进入复习")
    }
}

struct V2RarityMaterialOverlay: View {
    let rarity: ImageFlowMemoryCard.Rarity
    var cornerRadius: CGFloat = 24

    private var style: V2RarityVisualStyle {
        V2RarityVisualStyle(rarity)
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(style.surfaceTint)

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(style.accent.opacity(0.5), lineWidth: 1.2)

            if style.innerStrokeOpacity > 0 {
                RoundedRectangle(cornerRadius: max(0, cornerRadius - 4), style: .continuous)
                    .inset(by: 4)
                    .stroke(style.accent.opacity(style.innerStrokeOpacity), lineWidth: 0.8)
            }

            if style.fiberOpacity > 0 {
                LinearGradient(
                    colors: [
                        Color.clear,
                        style.accent.opacity(style.fiberOpacity),
                        Color.clear
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
