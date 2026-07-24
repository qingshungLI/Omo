import SwiftUI
import UIKit

private enum V2ScreenshotSummonPhase: Equatable {
    case summoning
    case recall
    case archived
}

struct V2ScreenshotAwakeningFlowView: View {
    let session: V2ScreenshotDrawSession
    let onAssessment: (String, V2MemoryAssessment) -> Void
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion
    @State private var currentIndex = 0
    @State private var phase = V2ScreenshotSummonPhase.summoning
    @State private var isRevealed = false
    @State private var revealProgress: CGFloat = 0
    @State private var assessment: V2MemoryAssessment?
    @State private var masteryBefore = V2MemoryMasteryStage.sealed
    @State private var masteryAfter = V2MemoryMasteryStage.sealed

    private var currentCard: V2CapturedMemoryCard {
        session.cards[min(currentIndex, session.cards.count - 1)]
    }

    var body: some View {
        ZStack {
            V2Color.pageGreenBackground
                .ignoresSafeArea()

            if phase == .summoning {
                summonTransition
                    .transition(.opacity)
            } else {
                VStack(spacing: 0) {
                    topBar
                    ScrollView(showsIndicators: false) {
                        if phase == .archived {
                            archiveLanding
                        } else if currentCard.card.state == .formal {
                            formalCard
                        } else {
                            fragmentCard
                        }
                    }
                }
            }
        }
        .interactiveDismissDisabled()
        .task(id: currentIndex) {
            guard phase == .summoning else { return }
            if reduceMotion {
                phase = .recall
                return
            }
            try? await Task.sleep(nanoseconds: 850_000_000)
            guard !Task.isCancelled, phase == .summoning else { return }
            withAnimation(.easeOut(duration: 0.2)) {
                phase = .recall
            }
        }
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
            .accessibilityLabel("退出召回")

            Spacer()

            Text(phase == .archived
                 ? "记忆收藏册"
                 : session.mode == .single
                    ? "唤醒一张记忆"
                    : "\(currentIndex + 1) / \(session.cards.count)")
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

    private var summonTransition: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Text(session.pool.title)
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.textMuted)
                Text("正在从你的过去召回")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(V2Color.textPrimary)
            }

            ZStack {
                ForEach(0..<2, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 25, style: .continuous)
                        .fill(V2Color.surfaceCream.opacity(index == 0 ? 0.5 : 0.72))
                        .frame(width: 238, height: 318)
                        .rotationEffect(.degrees(index == 0 ? -6 : 5))
                        .offset(x: index == 0 ? -16 : 18, y: index == 0 ? 17 : 12)
                        .v2Shadow()
                }

                if !reduceMotion {
                    Capsule()
                        .fill(rarityColor.opacity(0.34))
                        .frame(width: 330, height: 10)
                        .rotationEffect(.degrees(-24))
                        .offset(x: 75, y: -62)
                        .blur(radius: 4)
                        .transition(.opacity)
                }

                VStack(spacing: 18) {
                    rarityBadge
                    Image(systemName: "sparkles")
                        .font(.system(size: 42, weight: .light))
                        .foregroundStyle(V2Color.primary)
                    Text("一段记忆正在苏醒")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(V2Color.textPrimary)
                    Text(currentCard.masteryStage.title)
                        .font(V2Typography.caption)
                        .foregroundStyle(V2Color.textMuted)
                }
                .frame(width: 238, height: 318)
                .background(
                    RoundedRectangle(cornerRadius: 25, style: .continuous)
                        .fill(V2Color.surfaceCream)
                        .overlay(
                            RoundedRectangle(cornerRadius: 25, style: .continuous)
                                .stroke(rarityColor.opacity(0.56), lineWidth: 1.5)
                        )
                        .v2Shadow()
                )
                .transition(reduceMotion ? .opacity : .scale(scale: 0.76).combined(with: .opacity))
            }
            .frame(height: 350)

            Button("跳过过场") {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
                    phase = .recall
                }
            }
            .font(V2Typography.bodySmallEmphasis)
            .foregroundStyle(V2Color.textSecondary)
            .accessibilityHint("直接进入主动回忆")
        }
        .v2PageColumn()
    }

    private var formalCard: some View {
        VStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    rarityBadge
                    Spacer()
                    Text(currentCard.masteryStage.title)
                        .font(V2Typography.captionEmphasis)
                        .foregroundStyle(V2Color.primary)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(
                            Capsule()
                                .fill(V2Color.pageGreenBackground.opacity(0.45))
                                .overlay(
                                    Capsule()
                                        .stroke(V2Color.primary.opacity(0.35), lineWidth: 1)
                                )
                        )
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
                assessmentButton("想起来了", assessment: .remembered, color: V2Color.primary)
                assessmentButton("有点印象", assessment: .fuzzy, color: Color(hex: 0xD3A34A))
                assessmentButton("没想起来", assessment: .forgot, color: V2Color.feedbackWrongBorder)
            }
        }
    }

    private func assessmentButton(
        _ title: String,
        assessment: V2MemoryAssessment,
        color: Color
    ) -> some View {
        Button {
            completeAssessment(assessment)
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

    private var archiveLanding: some View {
        VStack(spacing: 18) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(V2Color.pageGreenBackground)
                    Image(systemName: session.pool.symbolName)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(V2Color.primary)
                }
                .frame(width: 76, height: 92)

                VStack(alignment: .leading, spacing: 7) {
                    rarityBadge
                    Text(currentCard.card.hiddenSemantic ?? currentCard.card.coreKnowledge)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(V2Color.textPrimary)
                        .lineLimit(3)
                    Text("已收入个人收藏")
                        .font(V2Typography.caption)
                        .foregroundStyle(V2Color.textMuted)
                }

                Spacer(minLength: 0)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 19, style: .continuous)
                    .fill(V2Color.surfaceCream)
                    .v2Shadow()
            )

            Text("记忆已修复并入册")
                .font(.system(size: 25, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)

            Text(assessment == .remembered
                 ? "你完成了一次主动重建。它会在新的时间窗口再次出现。"
                 : "记忆没有被惩罚或摧毁，系统只会让它更早再次出现。")
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)
                .multilineTextAlignment(.center)

            VStack(spacing: 14) {
                HStack(spacing: 4) {
                    ForEach(V2MemoryMasteryStage.allCases, id: \.rawValue) { stage in
                        masteryStep(stage)
                    }
                }

                Text("\(masteryBefore.title) → \(masteryAfter.title) · \(assessment == .remembered ? "3 天后再次召回" : "明天优先召回")")
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.primary)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(V2Color.surfaceCream)
                    .overlay(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .stroke(V2Color.primary.opacity(0.22), lineWidth: 1)
                    )
            )

            V2PrimaryActionButton(title: archiveActionTitle) {
                advanceOrClose()
            }

            Button("回到首页", action: onClose)
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textSecondary)
        }
        .v2PageColumn()
        .padding(.bottom, 36)
        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
    }

    private func masteryStep(_ stage: V2MemoryMasteryStage) -> some View {
        VStack(spacing: 6) {
            Circle()
                .fill(stage.rawValue <= masteryAfter.rawValue ? V2Color.primary : V2Color.surfaceCream)
                .overlay(
                    Circle()
                        .stroke(
                            stage.rawValue <= masteryAfter.rawValue
                                ? V2Color.primary
                                : V2Color.primary.opacity(0.22),
                            lineWidth: 2
                        )
                )
                .frame(width: 14, height: 14)
            Text(stage.title)
                .font(.system(size: 9, weight: stage == masteryAfter ? .bold : .regular))
                .foregroundStyle(stage.rawValue <= masteryAfter.rawValue ? V2Color.primary : V2Color.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private var archiveActionTitle: String {
        currentIndex + 1 < session.cards.count ? "继续召回" : "完成本次召回"
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

    private func completeAssessment(_ value: V2MemoryAssessment) {
        masteryBefore = currentCard.masteryStage
        masteryAfter = currentCard.masteryStage.applying(value)
        assessment = value
        onAssessment(currentCard.id, value)
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) {
            phase = .archived
        }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    private func advanceOrClose() {
        guard currentIndex + 1 < session.cards.count else {
            onClose()
            return
        }
        let animation: Animation? = reduceMotion ? nil : .easeOut(duration: 0.18)
        withAnimation(animation) {
            currentIndex += 1
            phase = .summoning
            isRevealed = false
            revealProgress = 0
            assessment = nil
        }
        UISelectionFeedbackGenerator().selectionChanged()
    }
}
