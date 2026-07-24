import SwiftUI
import UIKit

struct V2ScreenshotAwakeningFlowView: View {
    let session: V2ScreenshotDrawSession
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion
    @State private var currentIndex = 0
    @State private var isRevealed = false
    @State private var revealProgress: CGFloat = 0

    private var currentCard: V2CapturedMemoryCard {
        session.cards[min(currentIndex, session.cards.count - 1)]
    }

    var body: some View {
        ZStack {
            V2Color.pageGreenBackground
                .ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                ScrollView(showsIndicators: false) {
                    if currentCard.card.state == .formal {
                        formalCard
                    } else {
                        fragmentCard
                    }
                }
            }
        }
        .interactiveDismissDisabled()
    }

    private var topBar: some View {
        HStack {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(V2Color.textPrimary)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(V2Color.surfaceCream))
            }
            .accessibilityLabel("退出抽卡")

            Spacer()

            Text(session.mode == .single ? "唤醒一张记忆" : "\(currentIndex + 1) / \(session.cards.count)")
                .font(V2Typography.sectionTitle)
                .foregroundStyle(V2Color.topTitle)

            Spacer()

            Color.clear
                .frame(width: 42, height: 42)
        }
        .padding(.horizontal, V2Layout.pageHorizontalInset)
        .padding(.top, 12)
        .padding(.bottom, 16)
    }

    private var formalCard: some View {
        VStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    rarityBadge
                    Spacer()
                    sourceStatusLabel
                }

                Text("先别看答案")
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.textMuted)

                Text(currentCard.card.recallCue)
                    .font(.system(size: 23, weight: .bold))
                    .foregroundStyle(V2Color.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                if isRevealed {
                    revealedContent
                        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                } else {
                    semanticRevealControl
                }
            }
            .padding(22)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(V2Color.surfaceCream)
                    .v2Shadow()
            )

            if isRevealed {
                assessmentButtons
                    .transition(.opacity)
            } else {
                Button("直接揭晓") {
                    reveal()
                }
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textSecondary)
                .accessibilityHint("不需要拖动即可显示答案")
            }
        }
        .v2PageColumn()
        .padding(.bottom, 36)
    }

    private var rarityBadge: some View {
        Text(currentCard.card.rarity?.rawValue ?? "R")
            .font(.system(size: 15, weight: .heavy, design: .rounded))
            .foregroundStyle(rarityColor)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(rarityColor.opacity(0.14))
            )
            .accessibilityLabel("稀有度 \(currentCard.card.rarity?.rawValue ?? "R")")
    }

    private var sourceStatusLabel: some View {
        Label("来源已核对", systemImage: "checkmark.seal.fill")
            .font(V2Typography.captionEmphasis)
            .foregroundStyle(V2Color.primary)
    }

    private var semanticRevealControl: some View {
        VStack(alignment: .leading, spacing: 11) {
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(V2Color.uploadButtonFill)
                    .frame(height: 58)

                GeometryReader { geometry in
                    Capsule()
                        .fill(V2Color.primary.opacity(0.3))
                        .frame(width: max(58, geometry.size.width * revealProgress), height: 58)
                }
                .frame(height: 58)

                HStack {
                    Image(systemName: "hand.draw.fill")
                        .font(.system(size: 18, weight: .semibold))
                    Text(revealProgress >= 0.65 ? "松开揭晓" : "向右拖动，唤醒语义")
                        .font(V2Typography.bodySmallEmphasis)
                }
                .foregroundStyle(V2Color.textSecondary)
                .padding(.horizontal, 18)
            }
            .contentShape(Capsule())
            .gesture(
                DragGesture(minimumDistance: 4)
                    .onChanged { value in
                        revealProgress = min(1, max(0, value.translation.width / 220))
                    }
                    .onEnded { _ in
                        if revealProgress >= 0.65 {
                            reveal()
                        } else {
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
                                revealProgress = 0
                            }
                        }
                    }
            )
            .accessibilityHidden(true)

            Text("答案被遮住了，先在脑中说一遍")
                .font(V2Typography.caption)
                .foregroundStyle(V2Color.textMuted)
        }
    }

    private var revealedContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Divider()

            Text(currentCard.card.hiddenSemantic ?? "")
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(V2Color.primary)
                .fixedSize(horizontal: false, vertical: true)

            Text(currentCard.card.explanation)
                .font(V2Typography.body)
                .foregroundStyle(V2Color.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if let reason = currentCard.card.rarityReason {
                Text(reason)
                    .font(V2Typography.caption)
                    .foregroundStyle(V2Color.textMuted)
            }

            screenshotPreview
            sourceFooter
        }
    }

    private var screenshotPreview: some View {
        Group {
            if let image = UIImage(data: currentCard.screenshotData) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 260)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .accessibilityLabel("原始截图")
    }

    @ViewBuilder
    private var sourceFooter: some View {
        if currentCard.card.sourceStatus == .verified,
           let sourceURLString = currentCard.card.sourceUrl,
           let sourceURL = URL(string: sourceURLString) {
            Link(destination: sourceURL) {
                Label(currentCard.card.sourceTitle ?? "查看已核对来源", systemImage: "arrow.up.right.square")
                    .font(V2Typography.bodySmallEmphasis)
                    .foregroundStyle(V2Color.primary)
                    .lineLimit(2)
            }
        } else {
            Label("来源尚未确认", systemImage: "questionmark.circle")
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textMuted)
        }
    }

    private var assessmentButtons: some View {
        VStack(spacing: 10) {
            Text("刚才想起来了吗？")
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)

            HStack(spacing: 8) {
                assessmentButton("想起来了", color: V2Color.primary)
                assessmentButton("有点印象", color: Color(hex: 0xD3A34A))
                assessmentButton("没想起来", color: V2Color.feedbackWrongBorder)
            }
        }
    }

    private func assessmentButton(_ title: String, color: Color) -> some View {
        Button {
            advanceOrClose()
        } label: {
            Text(title)
                .font(V2Typography.label)
                .foregroundStyle(color)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(V2Color.surfaceCream)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(color.opacity(0.7), lineWidth: 1)
                        )
                )
        }
        .buttonStyle(.plain)
    }

    private var fragmentCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("记忆碎片 · 来源未确认", systemImage: "sparkles.rectangle.stack")
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textMuted)

            Text(currentCard.card.coreKnowledge)
                .font(.system(size: 23, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            screenshotPreview

            Text(currentCard.card.explanation)
                .font(V2Typography.body)
                .foregroundStyle(V2Color.textSecondary)

            Text(currentCard.card.recallCue)
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textMuted)

            V2PrimaryActionButton(title: nextButtonTitle) {
                advanceOrClose()
            }
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(V2Color.surfaceCream)
                .v2Shadow()
        )
        .v2PageColumn()
        .padding(.bottom, 36)
    }

    private var nextButtonTitle: String {
        currentIndex + 1 < session.cards.count ? "收下碎片，继续" : "收下碎片"
    }

    private var rarityColor: Color {
        switch currentCard.card.rarity {
        case .ssr:
            Color(hex: 0xD9852C)
        case .sr:
            Color(hex: 0x4F87B9)
        default:
            V2Color.textSecondary
        }
    }

    private func reveal() {
        let animation: Animation? = reduceMotion ? nil : .easeOut(duration: 0.22)
        withAnimation(animation) {
            revealProgress = 1
            isRevealed = true
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func advanceOrClose() {
        guard currentIndex + 1 < session.cards.count else {
            onClose()
            return
        }
        let animation: Animation? = reduceMotion ? nil : .easeOut(duration: 0.18)
        withAnimation(animation) {
            currentIndex += 1
            isRevealed = false
            revealProgress = 0
        }
        UISelectionFeedbackGenerator().selectionChanged()
    }
}
