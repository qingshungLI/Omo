import SwiftUI
import UIKit
import Pow

private enum V2ScreenshotSummonPhase: Equatable {
    case summoning
    case recall
    case feedback
    case submitting
    case archived
    case failure
}

private enum V2ScreenshotSummonVisualStage: Equatable {
    case compress
    case rise
    case orbit
    case settle
    case cue
}

private struct V2PendingScreenshotAssessment: Equatable {
    let assessment: V2MemoryAssessment
    let attemptId: String
}

struct V2ScreenshotAwakeningFlowView: View {
    let session: V2ScreenshotDrawSession
    let onAssessment: (String, V2MemoryAssessment, String) async throws -> ImageFlowReviewSchedule
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion
    @State private var currentIndex = 0
    @State private var phase = V2ScreenshotSummonPhase.summoning
    @State private var summonStage = V2ScreenshotSummonVisualStage.compress
    @State private var isRevealed = false
    @State private var revealProgress: CGFloat = 0
    @State private var isRevealDragging = false
    @State private var assessment: V2MemoryAssessment?
    @State private var masteryBefore = V2MemoryMasteryStage.sealed
    @State private var masteryAfter = V2MemoryMasteryStage.sealed
    @State private var currentSchedule: ImageFlowReviewSchedule?
    @State private var pendingAssessment: V2PendingScreenshotAssessment?
    @State private var variantFeedback = ""
    @State private var assessmentError = ""
    @State private var assessmentTask: Task<Void, Never>?

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
                        } else if phase == .feedback || phase == .submitting || phase == .failure {
                            feedbackLanding
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
        .task(id: summonTaskID) {
            guard phase == .summoning else { return }
            currentSchedule = currentCard.schedule
            summonStage = .compress
            if reduceMotion {
                try? await Task.sleep(nanoseconds: 150_000_000)
                guard !Task.isCancelled, phase == .summoning else { return }
                withAnimation(.easeOut(duration: 0.15)) {
                    phase = .recall
                }
                return
            }
            guard await advanceSummon(after: 120_000_000, to: .rise) else { return }
            guard await advanceSummon(after: 360_000_000, to: .orbit) else { return }
            guard await advanceSummon(after: 470_000_000, to: .settle) else { return }
            guard await advanceSummon(after: 300_000_000, to: .cue) else { return }
            try? await Task.sleep(nanoseconds: 200_000_000)
            guard !Task.isCancelled, phase == .summoning else { return }
            withAnimation(.easeOut(duration: 0.2)) {
                phase = .recall
            }
        }
        .onDisappear {
            assessmentTask?.cancel()
        }
    }

    private var summonTaskID: String {
        "\(currentIndex)-\(phase == .summoning ? "summoning" : "other")"
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
            .disabled(phase == .feedback || phase == .submitting)
            .accessibilityHint(
                phase == .feedback || phase == .submitting
                    ? "正在保存当前结果，完成后可以退出"
                    : "保留当前进度并返回首页"
            )

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

                if !reduceMotion && summonStage == .orbit {
                    Image("RecalloParticleGlow")
                        .resizable()
                        .renderingMode(.template)
                        .foregroundStyle(rarityColor.opacity(0.16))
                        .frame(width: 190, height: 190)
                        .transition(.opacity)

                    Ellipse()
                        .trim(from: 0.08, to: 0.84)
                        .stroke(
                            rarityColor.opacity(0.48),
                            style: StrokeStyle(lineWidth: 8, lineCap: .round)
                        )
                        .frame(width: 330, height: 165)
                        .rotationEffect(.degrees(-18))
                        .blur(radius: 2)
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
                .scaleEffect(summonCardScale)
                .offset(summonCardOffset)
                .rotationEffect(.degrees(summonCardRotation))
                .opacity(summonStage == .compress ? 0.86 : 1)
                .animation(
                    reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.8),
                    value: summonStage
                )
                .changeEffect(
                    .shine(duration: 0.35),
                    value: summonStage == .cue,
                    isEnabled: !reduceMotion
                )

                if summonStage == .cue {
                    Image("RecalloMascotSuccess")
                        .resizable()
                        .renderingMode(.original)
                        .scaledToFit()
                        .frame(width: 92, height: 92)
                        .offset(x: 126, y: 128)
                        .transition(.scale(scale: 0.88).combined(with: .opacity))
                        .accessibilityHidden(true)
                }
            }
            .frame(height: 350)

            Button("跳过过场") {
                finishSummon()
            }
            .font(V2Typography.bodySmallEmphasis)
            .foregroundStyle(V2Color.textSecondary)
            .accessibilityHint("直接进入主动回忆")
        }
        .v2PageColumn()
    }

    private var summonCardScale: CGFloat {
        switch summonStage {
        case .compress: 0.94
        case .rise: 0.98
        case .orbit: 1.035
        case .settle, .cue: 1
        }
    }

    private var summonCardOffset: CGSize {
        switch summonStage {
        case .compress: CGSize(width: 0, height: 28)
        case .rise: CGSize(width: 0, height: -22)
        case .orbit: CGSize(width: -8, height: -12)
        case .settle, .cue: .zero
        }
    }

    private var summonCardRotation: Double {
        switch summonStage {
        case .compress: -2
        case .rise: 3
        case .orbit: -3
        case .settle, .cue: 0
        }
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
                } else if currentCard.masteryStage == .sealed || activeRecallVariant == nil {
                    semanticRevealControl
                } else {
                    recallVariantControl
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
            } else if currentCard.masteryStage == .sealed || activeRecallVariant == nil {
                Button("直接揭晓") {
                    reveal()
                }
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textSecondary)
                .accessibilityHint("不需要拖动即可显示答案")
            }
        }
        .v2PageColumn()
        .rotation3DEffect(
            .degrees(isRevealDragging && !reduceMotion ? Double(revealProgress - 0.5) * 3 : 0),
            axis: (x: 0, y: 1, z: 0),
            perspective: 0.45
        )
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
        Label(sourceStatusTitle, systemImage: sourceStatusSymbol)
            .font(V2Typography.captionEmphasis)
            .foregroundStyle(sourceStatusColor)
            .accessibilityLabel(sourceStatusTitle)
    }

    private var activeRecallVariant: ImageFlowRecallVariant? {
        let variants = currentCard.card.recallVariants ?? []
        if currentCard.masteryStage.rawValue <= V2MemoryMasteryStage.awakened.rawValue {
            return variants.first(where: { $0.type == .trueFalse })
                ?? variants.first(where: { $0.type != .semanticCloze })
        }
        return variants.first(where: { $0.type == .multipleChoice })
            ?? variants.first(where: { $0.type != .semanticCloze })
    }

    @ViewBuilder
    private var recallVariantControl: some View {
        if let variant = activeRecallVariant {
            VStack(alignment: .leading, spacing: 12) {
                Text(variant.type == .trueFalse ? "判断一下" : "选出最准确的一项")
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.textMuted)

                Text(variant.prompt)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(V2Color.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                if variant.type == .trueFalse {
                    HStack(spacing: 10) {
                        variantButton("对") {
                            answerVariant(variant.correctBoolean == true)
                        }
                        variantButton("不对") {
                            answerVariant(variant.correctBoolean == false)
                        }
                    }
                } else {
                    VStack(spacing: 9) {
                        ForEach(variant.options) { option in
                            variantButton(option.text) {
                                answerVariant(option.id == variant.correctOptionId)
                            }
                        }
                    }
                }
            }
            .accessibilityElement(children: .contain)
        }
    }

    private func variantButton(
        _ title: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .frame(minHeight: 48)
                .background(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(V2Color.surfaceCream)
                        .overlay(
                            RoundedRectangle(cornerRadius: 13, style: .continuous)
                                .stroke(V2Color.primary.opacity(0.28), lineWidth: 1)
                        )
                )
        }
        .buttonStyle(.plain)
    }

    private var semanticRevealControl: some View {
        VStack(alignment: .leading, spacing: 11) {
            Text(maskedCoreKnowledge)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(V2Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(V2Color.uploadButtonFill)

                Text(hiddenSemanticText)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(V2Color.textMuted.opacity(0.24))
                    .redacted(reason: .placeholder)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 17)

                GeometryReader { geometry in
                    Text(hiddenSemanticText)
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(V2Color.primary)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 17)
                        .frame(width: geometry.size.width, alignment: .leading)
                        .mask(alignment: .leading) {
                            Rectangle()
                                .frame(width: geometry.size.width * revealProgress)
                        }
                }

                if revealProgress < 0.18 {
                    HStack(spacing: 8) {
                        Image(systemName: "hand.draw.fill")
                        Text("擦开被遮住的语义")
                            .font(V2Typography.bodySmallEmphasis)
                    }
                    .foregroundStyle(V2Color.textSecondary)
                    .padding(.horizontal, 18)
                }
            }
            .frame(minHeight: 72)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 4)
                    .onChanged { value in
                        isRevealDragging = true
                        revealProgress = min(1, max(0, value.translation.width / 240))
                    }
                    .onEnded { _ in
                        isRevealDragging = false
                        if revealProgress >= 0.45 {
                            reveal()
                        } else {
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
                                revealProgress = 0
                            }
                        }
                    }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("被遮住的语义")
            .accessibilityValue("\(Int(revealProgress * 100))% 已揭示")
            .accessibilityHint("向右拖动或轻点直接揭晓")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment:
                    revealProgress = min(1, revealProgress + 0.25)
                    if revealProgress >= 0.45 { reveal() }
                case .decrement:
                    revealProgress = max(0, revealProgress - 0.25)
                @unknown default:
                    break
                }
            }
            .accessibilityAction(named: "完整揭晓") {
                reveal()
            }
            .accessibilityIdentifier("v2.semantic-reveal")

            Text("承重语义已在原句中精确遮挡；擦开 45% 后完整揭示")
                .font(V2Typography.caption)
                .foregroundStyle(V2Color.textMuted)
        }
    }

    private var maskedCoreKnowledge: String {
        let core = currentCard.card.coreKnowledge
        let hidden = hiddenSemanticText
        guard core.contains(hidden) else { return core }
        return core.replacingOccurrences(
            of: hidden,
            with: String(repeating: "▰", count: min(max(hidden.count, 4), 12))
        )
    }

    private var hiddenSemanticText: String {
        let value = currentCard.card.hiddenSemantic?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? "这张卡暂时没有可揭示语义" : value
    }

    private var revealedContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Divider()

            if !variantFeedback.isEmpty {
                Text(variantFeedback)
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.primary)
            }

            Text(currentCard.card.coreKnowledge)
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
            Label(sourceStatusTitle, systemImage: sourceStatusSymbol)
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
                assessmentButton("记得", assessment: .remembered, color: V2Color.primary)
                assessmentButton("模糊", assessment: .fuzzy, color: Color(hex: 0xD3A34A))
                assessmentButton("忘记", assessment: .forgot, color: V2Color.feedbackWrongBorder)
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
        .disabled(phase != .recall)
        .accessibilityIdentifier("v2.assessment.\(assessment.rawValue)")
    }

    private var feedbackLanding: some View {
        VStack(spacing: 20) {
            ZStack {
                if assessment != .remembered {
                    Image("RecalloParticlePuff")
                        .resizable()
                        .renderingMode(.template)
                        .foregroundStyle(V2Color.textMuted.opacity(0.14))
                        .frame(width: 178, height: 178)
                        .accessibilityHidden(true)
                }

                Image(feedbackMascotAsset)
                    .resizable()
                    .renderingMode(.original)
                    .scaledToFit()
                    .frame(width: 164, height: 164)
                    .offset(y: feedbackMascotOffset)
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.36, dampingFraction: 0.68),
                        value: phase
                    )
                    .changeEffect(
                        .jump(height: 18),
                        value: phase == .feedback,
                        isEnabled: assessment == .remembered && !reduceMotion
                    )
                    .changeEffect(
                        .spray(origin: .center) {
                            Image("RecalloParticleSpark")
                                .resizable()
                                .renderingMode(.template)
                                .foregroundStyle(Color(hex: 0xE8B44C))
                                .frame(width: 10, height: 10)
                        },
                        value: phase == .feedback,
                        isEnabled: assessment == .remembered && !reduceMotion
                    )
            }
            .frame(width: 230, height: 180)
            .accessibilityHidden(true)

            Text(feedbackTitle)
                .font(.system(size: 25, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)

            Text(feedbackDetail)
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)
                .multilineTextAlignment(.center)

            if phase == .submitting {
                ProgressView()
                    .tint(V2Color.primary)
                    .accessibilityLabel("正在保存复习结果")
            }

            if phase == .failure {
                Text(assessmentError)
                    .font(V2Typography.caption)
                    .foregroundStyle(V2Color.textSecondary)
                    .multilineTextAlignment(.center)

                V2PrimaryActionButton(title: "重试保存") {
                    retryAssessment()
                }
                .accessibilityIdentifier("v2.assessment.retry")
            }
        }
        .v2PageColumn()
        .padding(.top, 34)
        .padding(.bottom, 36)
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

                Text("\(masteryBefore.title) → \(masteryAfter.title) · \(currentSchedule?.displayText ?? "下次复习时间待同步")")
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.primary)
                    .accessibilityIdentifier("v2.schedule.next-review")
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
            Label("记忆碎片 · \(sourceStatusTitle)", systemImage: "sparkles.rectangle.stack")
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

    private var sourceStatusTitle: String {
        switch currentCard.card.sourceStatus {
        case .verified: "来源已核对"
        case .partial: "部分来源已核对"
        case .unconfirmed: "来源尚未确认"
        }
    }

    private var sourceStatusSymbol: String {
        switch currentCard.card.sourceStatus {
        case .verified: "checkmark.seal.fill"
        case .partial: "checkmark.seal"
        case .unconfirmed: "questionmark.circle"
        }
    }

    private var sourceStatusColor: Color {
        switch currentCard.card.sourceStatus {
        case .verified: V2Color.primary
        case .partial: Color(hex: 0xD3A34A)
        case .unconfirmed: V2Color.textMuted
        }
    }

    private var feedbackMascotAsset: String {
        switch assessment {
        case .remembered: "RecalloMascotHop"
        case .fuzzy: "RecalloMascotTilt"
        case .forgot: "RecalloMascotThinking"
        case nil: "RecalloMascotIdle"
        }
    }

    private var feedbackMascotOffset: CGFloat {
        guard !reduceMotion, phase == .feedback, assessment == .remembered else { return 0 }
        return -10
    }

    private var feedbackTitle: String {
        switch phase {
        case .failure: "结果还没有保存"
        case .submitting: "正在安排下次召回"
        default:
            switch assessment {
            case .remembered: "这段记忆更清晰了"
            case .fuzzy: "已经找到一点轮廓"
            case .forgot: "没关系，下次再修复"
            case nil: "正在保存"
            }
        }
    }

    private var feedbackDetail: String {
        if phase == .failure {
            return "保留当前选择并重试，不会重复记录。"
        }
        switch assessment {
        case .remembered: "毛球记下了这次主动重建。"
        case .fuzzy: "系统会把它安排在更合适的时间再次出现。"
        case .forgot: "记忆不会被惩罚，只会更早回来。"
        case nil: "正在处理这次复习。"
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

    private func answerVariant(_ isCorrect: Bool) {
        variantFeedback = isCorrect
            ? "回答正确 · 现在检查证据"
            : "这次没有答对 · 不扣分，只会更早复习"
        reveal()
    }

    private func completeAssessment(_ value: V2MemoryAssessment) {
        guard pendingAssessment == nil, phase == .recall else { return }
        masteryBefore = currentCard.masteryStage
        masteryAfter = currentCard.masteryStage.applying(value)
        assessment = value
        pendingAssessment = V2PendingScreenshotAssessment(
            assessment: value,
            attemptId: "ios-capture-assessment-\(UUID().uuidString)"
        )
        assessmentError = ""
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.34, dampingFraction: 0.78)) {
            phase = .feedback
        }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        submitPendingAssessment(includesReactionDelay: true)
    }

    private func retryAssessment() {
        guard pendingAssessment != nil else { return }
        assessmentError = ""
        submitPendingAssessment(includesReactionDelay: false)
    }

    private func submitPendingAssessment(includesReactionDelay: Bool) {
        guard let pendingAssessment else { return }
        assessmentTask?.cancel()
        assessmentTask = Task {
            if includesReactionDelay {
                try? await Task.sleep(
                    nanoseconds: reduceMotion ? 150_000_000 : 520_000_000
                )
            }
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: reduceMotion ? 0.12 : 0.2)) {
                phase = .submitting
            }
            do {
                let schedule = try await onAssessment(
                    currentCard.id,
                    pendingAssessment.assessment,
                    pendingAssessment.attemptId
                )
                guard !Task.isCancelled else { return }
                currentSchedule = schedule
                self.pendingAssessment = nil
                withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.24)) {
                    phase = .archived
                }
            } catch is CancellationError {
                return
            } catch {
                assessmentError = error.localizedDescription
                withAnimation(.easeOut(duration: 0.18)) {
                    phase = .failure
                }
            }
        }
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
            summonStage = .compress
            isRevealed = false
            revealProgress = 0
            isRevealDragging = false
            assessment = nil
            currentSchedule = session.cards[currentIndex].schedule
            pendingAssessment = nil
            assessmentError = ""
            variantFeedback = ""
        }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func finishSummon() {
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.18)) {
            phase = .recall
        }
    }

    private func advanceSummon(
        after nanoseconds: UInt64,
        to nextStage: V2ScreenshotSummonVisualStage
    ) async -> Bool {
        try? await Task.sleep(nanoseconds: nanoseconds)
        guard !Task.isCancelled, phase == .summoning else { return false }
        withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
            summonStage = nextStage
        }
        return true
    }
}
