import SwiftUI
import UIKit
import Pow

private enum V2ScreenshotSummonVisualStage: Equatable {
    case turn
    case approach
    case rummage
    case carrying
    case orbit
    case settle
    case cue
}

private enum V2ScreenshotStowVisualStage: Equatable {
    case cardReady
    case dropping
    case closing
    case farewell
}

private struct V2PendingScreenshotAssessment: Equatable {
    let assessment: V2MemoryAssessment
    let attemptId: String
}

struct V2CardStackGlyph: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Image("RecallCardStack")
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
                .frame(width: 38, height: 34)

            Image("RecallExpandIcon")
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
                .frame(width: 17, height: 17)
                .offset(x: 2, y: -2)
        }
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
}

private struct V2SourceContextSheetItem: Identifiable, Equatable {
    let cardID: String
    let sourceTitle: String?
    let groupCardCount: Int
    let groupCardIndex: Int
    let context: ImageFlowSourceContext

    var id: String { cardID }
}

private struct V2SourceContextSheetView: View {
    @Environment(\.dismiss)
    private var dismiss
    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion

    let item: V2SourceContextSheetItem

    private var visibleBlocks: [ImageFlowSourceContext.Block] {
        Array(item.context.blocks.prefix(64))
    }

    private var focusBlockIDs: Set<String> {
        Set(item.context.focusBlockIds)
    }

    private var firstFocusBlockID: String? {
        visibleBlocks.first(where: { focusBlockIDs.contains($0.id) })?.id
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        sourceSummary

                        // nearbyText repeats typed blocks; show it standalone only as a no-blocks fallback (Web parity).
                        if visibleBlocks.isEmpty,
                           !item.context.nearbyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Label("当前截图附近的内容", systemImage: "viewfinder")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(V2Color.primary)
                                Text(item.context.nearbyText)
                                    .font(.body)
                                    .foregroundStyle(V2Color.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(V2Color.surfaceSageTint)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .stroke(V2Color.primary.opacity(0.34), lineWidth: 1)
                                    )
                            )
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("v2.source-context.nearby")
                        }

                        if visibleBlocks.isEmpty {
                            Text("原内容脉络仍在补全；当前先展示截图附近的片段。")
                                .font(.subheadline)
                                .foregroundStyle(V2Color.textMuted)
                                .padding(.vertical, 10)
                        } else {
                            Text("原内容脉络")
                                .font(.headline)
                                .foregroundStyle(V2Color.textPrimary)
                                .padding(.top, 4)

                            ForEach(visibleBlocks) { block in
                                sourceBlock(block)
                                    .id(block.id)
                            }
                        }
                    }
                    .padding(.horizontal, V2Layout.pageHorizontalInset)
                    .padding(.vertical, 18)
                }
                .onAppear {
                    guard let firstFocusBlockID else { return }
                    DispatchQueue.main.async {
                        if reduceMotion {
                            proxy.scrollTo(firstFocusBlockID, anchor: .center)
                        } else {
                            withAnimation(.easeOut(duration: 0.28)) {
                                proxy.scrollTo(firstFocusBlockID, anchor: .center)
                            }
                        }
                        UIAccessibility.post(
                            notification: .layoutChanged,
                            argument: "已定位到当前截图附近的内容"
                        )
                    }
                }
            }
            .background(Color(hex: 0xFFF6E8).ignoresSafeArea())
            .navigationTitle("内容脉络")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                    .frame(minWidth: 44, minHeight: 44)
                    .accessibilityHint("关闭内容脉络并回到当前记忆卡")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private var sourceSummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let sourceTitle = item.sourceTitle,
               !sourceTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(sourceTitle)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(V2Color.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                Label(
                    item.groupCardCount > 1
                        ? "这份内容生成了 \(item.groupCardCount) 张记忆卡 · 当前 \(item.groupCardIndex + 1) / \(item.groupCardCount)"
                        : "这张记忆卡来自以下内容",
                    systemImage: "rectangle.stack"
                )
                Spacer(minLength: 4)
                Text(completenessTitle)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(V2Color.textMuted)

            if let overview = item.context.overview {
                if !overview.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(overview.summary)
                        .font(.body)
                        .foregroundStyle(V2Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(
                    Array(overview.highlights.prefix(6).enumerated()),
                    id: \.offset
                ) { _, highlight in
                    Label(highlight, systemImage: "sparkle")
                        .font(.subheadline)
                        .foregroundStyle(V2Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func sourceBlock(_ block: ImageFlowSourceContext.Block) -> some View {
        let isFocus = focusBlockIDs.contains(block.id)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if isFocus {
                    Label("当前截图附近", systemImage: "scope")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(V2Color.primary)
                } else if let sourceRole = block.sourceRole, !sourceRole.isEmpty {
                    Text(sourceRole)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(V2Color.textMuted)
                } else if let type = block.type, !type.isEmpty {
                    Text(type)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(V2Color.textMuted)
                }

                Spacer(minLength: 4)

                if let timestamp = timestampText(for: block) {
                    Text(timestamp)
                        .font(.caption)
                        .foregroundStyle(V2Color.textMuted)
                }
            }

            Text(block.text)
                .font(.body)
                .foregroundStyle(V2Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(15)
        .background(
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .fill(isFocus ? V2Color.surfaceSageTint : V2Color.surfaceCream)
                .overlay(
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .stroke(
                            isFocus ? V2Color.primary.opacity(0.52) : V2Color.borderSoftGreen.opacity(0.8),
                            lineWidth: isFocus ? 1.5 : 1
                        )
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            isFocus
                ? "当前截图附近的内容，\(block.text)"
                : block.text
        )
        .accessibilityIdentifier(
            isFocus ? "v2.source-context.focus" : "v2.source-context.block"
        )
    }

    private var completenessTitle: String {
        // Frozen with the Web labels (docs/ios-app-demo.html contextCompletenessLabel).
        switch item.context.completeness {
        case .full: "脉络较完整"
        case .partial: "脉络不完整"
        case .screenshotOnly: "仅截图附近"
        }
    }

    private func timestampText(for block: ImageFlowSourceContext.Block) -> String? {
        guard let startSeconds = block.startSeconds else { return nil }
        let start = formatTimestamp(startSeconds)
        guard let endSeconds = block.endSeconds, endSeconds > startSeconds else {
            return start
        }
        return "\(start)–\(formatTimestamp(endSeconds))"
    }

    private func formatTimestamp(_ seconds: Double) -> String {
        let clamped = max(0, Int(seconds.rounded()))
        return String(format: "%d:%02d", clamped / 60, clamped % 60)
    }
}


private struct V2ScratchRevealCanvas: View {
    let hiddenText: String
    let reduceMotion: Bool
    @Binding var paths: [[CGPoint]]
    @Binding var coveredCells: Set<String>
    @Binding var coverage: CGFloat
    @Binding var isDrawing: Bool
    let onScratchStart: () -> Void
    let onReveal: () -> Void

    private let gridColumns = 12
    private let gridRows = 7
    private let brushDiameter: CGFloat = 26

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Canvas { context, size in
                    let answerFrame = CGRect(
                        x: 18,
                        y: 17,
                        width: max(0, size.width - 36),
                        height: max(0, size.height - 34)
                    )
                    let renderedAnswer = context.resolve(
                        Text(verbatim: hiddenText)
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundColor(V2Color.primary)
                    )
                    context.draw(renderedAnswer, in: answerFrame)

                    let layer = Path(
                        roundedRect: CGRect(origin: .zero, size: size),
                        cornerRadius: 16
                    )
                    context.drawLayer { coverContext in
                        coverContext.fill(layer, with: .color(V2Color.uploadButtonFill))
                        coverContext.blendMode = .destinationOut
                        for normalizedPoints in paths where normalizedPoints.count > 1 {
                            let points = normalizedPoints.map { renderedPoint($0, in: size) }
                            var stroke = Path()
                            stroke.move(to: points[0])
                            for point in points.dropFirst() {
                                stroke.addLine(to: point)
                            }
                            coverContext.stroke(
                                stroke,
                                with: .color(.black),
                                style: StrokeStyle(
                                    lineWidth: brushDiameter,
                                    lineCap: .round,
                                    lineJoin: .round
                                )
                            )
                        }
                    }
                }
                .drawingGroup()

                if coverage < 0.18 {
                    HStack(spacing: 8) {
                        Image(systemName: "hand.draw.fill")
                        Text("像刮开旧照片一样，找回这句话")
                            .font(V2Typography.bodySmallEmphasis)
                    }
                    .foregroundStyle(V2Color.textSecondary)
                    .padding(.horizontal, 18)
                    .allowsHitTesting(false)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 3, coordinateSpace: .local)
                    .onChanged { value in
                        if !isDrawing {
                            isDrawing = true
                            paths.append([])
                            onScratchStart()
                        }
                        paths[paths.count - 1].append(
                            normalizedPoint(value.location, in: geometry.size)
                        )
                        markCoveredCells(at: value.location, size: geometry.size)
                    }
                    .onEnded { _ in
                        isDrawing = false
                        if coverage >= 0.45 {
                            onReveal()
                        }
                    }
            )
            .simultaneousGesture(
                TapGesture()
                    .onEnded {
                        onReveal()
                    }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("被铅笔涂层遮住的语义")
            .accessibilityValue("\(Int(coverage * 100))% 已刮开")
            .accessibilityHint("轻点完整揭示；上下滑动可逐步刮开")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment:
                    adjustCoveredCells(by: 0.15)
                case .decrement:
                    adjustCoveredCells(by: -0.15)
                @unknown default:
                    break
                }
            }
            .accessibilityAction(named: "完整揭示") {
                onReveal()
            }
        }
        .frame(minHeight: 86)
    }

    private func normalizedPoint(_ point: CGPoint, in size: CGSize) -> CGPoint {
        guard size.width > 0, size.height > 0 else { return .zero }
        return CGPoint(
            x: min(1, max(0, point.x / size.width)),
            y: min(1, max(0, point.y / size.height))
        )
    }

    private func renderedPoint(_ point: CGPoint, in size: CGSize) -> CGPoint {
        CGPoint(
            x: point.x * size.width,
            y: point.y * size.height
        )
    }

    private func markCoveredCells(at point: CGPoint, size: CGSize) {
        guard size.width > 0, size.height > 0 else { return }
        let column = min(gridColumns - 1, max(0, Int(point.x / size.width * CGFloat(gridColumns))))
        let row = min(gridRows - 1, max(0, Int(point.y / size.height * CGFloat(gridRows))))
        let radiusColumns = max(
            0,
            Int(((brushDiameter / 2) / max(1, size.width / CGFloat(gridColumns))).rounded())
        )
        let radiusRows = max(
            0,
            Int(((brushDiameter / 2) / max(1, size.height / CGFloat(gridRows))).rounded())
        )
        for x in max(0, column - radiusColumns)...min(gridColumns - 1, column + radiusColumns) {
            for y in max(0, row - radiusRows)...min(gridRows - 1, row + radiusRows) {
                coveredCells.insert("\(x):\(y)")
            }
        }
        coverage = min(1, CGFloat(coveredCells.count) / CGFloat(gridColumns * gridRows))
        if coverage >= 0.45 {
            onReveal()
        }
    }

    private func adjustCoveredCells(by delta: CGFloat) {
        let totalCells = gridColumns * gridRows
        let targetCoverage = min(1, max(0, coverage + delta))
        let targetCount = Int((targetCoverage * CGFloat(totalCells)).rounded())
        let allCells = (0..<gridRows).flatMap { row in
            (0..<gridColumns).map { column in "\(column):\(row)" }
        }
        if targetCount > coveredCells.count {
            for cell in allCells where !coveredCells.contains(cell) {
                coveredCells.insert(cell)
                if coveredCells.count >= targetCount { break }
            }
        } else if targetCount < coveredCells.count {
            for cell in coveredCells.sorted().reversed() {
                coveredCells.remove(cell)
                if coveredCells.count <= targetCount { break }
            }
        }
        coverage = min(1, CGFloat(coveredCells.count) / CGFloat(totalCells))
        onScratchStart()
        if coverage >= 0.45 { onReveal() }
    }
}

struct V2ScreenshotAwakeningFlowView: View {
    let session: V2ScreenshotDrawSession
    let onAssessment: (String, V2MemoryAssessment, String) async throws -> CaptureMemoryCardAssessmentResponse
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion)
    private var reduceMotion
    @Environment(\.scenePhase)
    private var scenePhase
    @Environment(\.colorScheme)
    private var colorScheme
    @State private var currentIndex = 0
    @State private var phase = V2RecallPresentationPhase.summoning
    @State private var phaseBeforePause = V2RecallPresentationPhase.recall
    @State private var summonStage = V2ScreenshotSummonVisualStage.turn
    @State private var stowStage = V2ScreenshotStowVisualStage.cardReady
    @State private var stowCompletionHandled = false
    @State private var isRevealed = false
    @State private var revealProgress: CGFloat = 0
    @State private var isRevealDragging = false
    @State private var assessment: V2MemoryAssessment?
    @State private var masteryBefore = V2MemoryMasteryStage.sealed
    @State private var masteryAfter = V2MemoryMasteryStage.sealed
    @State private var currentSchedule: ImageFlowReviewSchedule?
    @State private var presentationReviewCycleKey = ""
    @State private var pendingAssessment: V2PendingScreenshotAssessment?
    @State private var variantFeedback = ""
    @State private var assessmentError = ""
    @State private var assessmentTask: Task<Void, Never>?
    @State private var recallCompanionPose: OmoMascotPose = .dazed
    @State private var recallCompanionHasConfused = false
    @State private var feedbackPose: OmoMascotPose = .dazed
    @State private var revealDebrisVisible = false
    @State private var revealDebrisTicket = 0
    @State private var assessmentReactionTick = 0
    @State private var fuzzyBreathActive = false
    @State private var forgotReactionActive = false
    @State private var scratchPaths: [[CGPoint]] = []
    @State private var coveredScratchCells: Set<String> = []
    @State private var activeSourceContext: V2SourceContextSheetItem?
    @AppStorage("recallo.v06.currentCardID") private var persistedCardID = ""
    @AppStorage("recallo.v06.currentIndex") private var persistedCurrentIndex = 0
    @AppStorage("recallo.v06.phase") private var persistedPhase = V2RecallPresentationPhase.home.rawValue
    @AppStorage("recallo.v06.revealCoverage") private var persistedRevealCoverage = 0.0
    @AppStorage("recallo.v06.isRevealed") private var persistedIsRevealed = false
    @AppStorage("recallo.v06.scratchPaths") private var persistedScratchPaths = ""
    @AppStorage("recallo.v06.coveredCells") private var persistedCoveredCells = ""
    @AppStorage("recallo.v06.assessedReviewCycles") private var persistedAssessedReviewCycles = ""
    @AppStorage("recallo.v06.presentationReviewCycleKey") private var persistedPresentationReviewCycleKey = ""
    @AppStorage("recallo.v06.assessment") private var persistedAssessment = ""
    @AppStorage("recallo.v06.masteryBefore") private var persistedMasteryBefore = 0
    @AppStorage("recallo.v06.masteryAfter") private var persistedMasteryAfter = 0
    @AppStorage("recallo.v06.scheduleNextReviewAt") private var persistedScheduleNextReviewAt = ""
    @AppStorage("recallo.v06.scheduleIntervalDays") private var persistedScheduleIntervalDays = 0
    @AppStorage("recallo.v06.scheduleState") private var persistedScheduleState = ""
    @AppStorage("recallo.v06.scheduleStatus") private var persistedScheduleStatus = ""

    private var currentCard: V2CapturedMemoryCard {
        session.cards[min(currentIndex, session.cards.count - 1)]
    }

    var body: some View {
        ZStack {
            sceneBackgroundColor
                .ignoresSafeArea()

            if phase == .summoning {
                summonTransition
                    .transition(.opacity)
            } else if phase == .stowing {
                stowingLanding
                    .transition(.opacity)
            } else if phase == .paused {
                pausedLanding
                    .transition(.opacity)
            } else {
                VStack(spacing: 0) {
                    topBar
                    ScrollView(showsIndicators: false) {
                        if phase == .checkpoint {
                            archiveLanding
                        } else if phase == .repairing {
                            repairingLanding
                        } else if phase == .assessing {
                            feedbackLanding
                        } else if currentCard.isFormalReviewCard {
                            if !currentCard.isReadyForReview {
                                ungradedFormalCard
                            } else {
                                formalCard
                            }
                        } else {
                            fragmentCard
                        }
                    }
                }
            }
        }
        .interactiveDismissDisabled(phase == .assessing || phase == .repairing)
        .sheet(item: $activeSourceContext) { sourceContext in
            V2SourceContextSheetView(item: sourceContext)
        }
        .task(id: summonTaskID) {
            guard phase == .summoning else { return }
            currentSchedule = currentCard.schedule
            if presentationReviewCycleKey.isEmpty {
                presentationReviewCycleKey = currentCard.reviewCycleKey(scheduleOverride: currentSchedule)
            }
            summonStage = .turn
            if reduceMotion {
                try? await Task.sleep(nanoseconds: 180_000_000)
                guard !Task.isCancelled, phase == .summoning else { return }
                withAnimation(.easeOut(duration: 0.18)) {
                    phase = .recall
                }
                return
            }

            // 首张 1800ms 完整演出；后续 900ms 省略环绕，避免连续复习疲劳。
            let timings: [UInt64] = currentIndex == 0
                ? [120_000_000, 220_000_000, 340_000_000, 300_000_000, 420_000_000, 240_000_000, 160_000_000]
                : [80_000_000, 130_000_000, 190_000_000, 0, 120_000_000, 250_000_000, 130_000_000]
            guard await advanceSummon(after: timings[0], to: .approach) else { return }
            guard await advanceSummon(after: timings[1], to: .rummage) else { return }
            guard await advanceSummon(after: timings[2], to: .carrying) else { return }
            if currentIndex == 0 {
                guard await advanceSummon(after: timings[3], to: .orbit) else { return }
            }
            guard await advanceSummon(after: timings[5], to: .settle) else { return }
            guard await advanceSummon(after: timings[6], to: .cue) else { return }
            try? await Task.sleep(nanoseconds: timings[4])
            guard !Task.isCancelled, phase == .summoning else { return }
            withAnimation(.easeOut(duration: 0.18)) {
                phase = .recall
            }
        }
        .onAppear {
            restorePersistedState()
        }
        .onDisappear {
            assessmentTask?.cancel()
            persistPresentationState()
        }
        .onChange(of: phase) { _, _ in
            persistPresentationState()
        }
        .onChange(of: revealProgress) { _, _ in
            persistPresentationState()
        }
        .onChange(of: isRevealed) { _, _ in
            persistPresentationState()
        }
        .onChange(of: scenePhase) { _, newScenePhase in
            switch newScenePhase {
            case .active:
                if phase == .paused {
                    phase = phaseBeforePause
                }
            case .inactive:
                persistPresentationState()
            case .background:
                guard phase != .assessing, phase != .repairing, phase != .stowing else {
                    persistPresentationState()
                    return
                }
                phaseBeforePause = stablePhase(for: phase)
                phase = .paused
            @unknown default:
                persistPresentationState()
            }
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
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(V2Color.surfaceCream))
            }
            .accessibilityLabel("退出召回")
            .disabled(phase == .assessing || phase == .repairing)
            .accessibilityHint(
                phase == .assessing || phase == .repairing
                    ? "正在保存当前结果，完成后可以退出"
                    : "保留当前进度并返回首页"
            )

            Spacer()

            Text(
                phase == .repairing
                    ? "修复记忆"
                    : (phase == .checkpoint ? "记忆收藏册" : "唤醒一张记忆")
            )
                .font(V2Typography.sectionTitle)
                .foregroundStyle(V2Color.topTitle)

            Spacer()

            Color.clear
                .frame(width: 44, height: 44)
        }
        .padding(.horizontal, V2Layout.pageHorizontalInset)
        .padding(.top, 12)
        .padding(.bottom, 16)
    }

    private var summonTransition: some View {
        VStack(spacing: 28) {
            VStack(spacing: 8) {
                Text("正在从你的过去召回")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                    .foregroundStyle(V2Color.textPrimary)
                Text("一张旧内容正在回来")
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.textMuted)
            }

            ZStack {
                Image("RecallFolder")
                    .resizable()
                    .renderingMode(.original)
                    .scaledToFit()
                    .frame(width: 126, height: 126)
                    .offset(x: -128, y: 116)
                    .scaleEffect(summonStage == .rummage ? 1.04 : 1)
                    .rotationEffect(.degrees(summonStage == .rummage ? -2 : 0))
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.74),
                        value: summonStage
                    )
                    .accessibilityHidden(true)

                ForEach(0..<2, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 25, style: .continuous)
                        .fill(V2Color.surfaceCream.opacity(index == 0 ? 0.5 : 0.72))
                        .frame(width: 238, height: 318)
                        .rotationEffect(.degrees(index == 0 ? -6 : 5))
                        .offset(x: index == 0 ? -16 : 18, y: index == 0 ? 17 : 12)
                        .v2Shadow()
                        .opacity(rarityIsRevealed ? 1 : 0)
                        .animation(
                            reduceMotion ? nil : .easeInOut(duration: 0.3),
                            value: summonStage
                        )
                }

                if !reduceMotion && summonStage == .orbit {
                    Image("OmoParticleGlow")
                        .resizable()
                        .renderingMode(.template)
                        .foregroundStyle(V2Color.textMuted.opacity(0.13))
                        .frame(width: 190, height: 190)
                        .transition(.opacity)

                    Ellipse()
                        .trim(from: 0.08, to: 0.84)
                        .stroke(
                            V2Color.textMuted.opacity(0.38),
                            style: StrokeStyle(lineWidth: 8, lineCap: .round)
                        )
                        .frame(width: 330, height: 165)
                        .rotationEffect(.degrees(-18))
                        .blur(radius: 2)
                        .transition(.opacity)
                }

                VStack(spacing: 18) {
                    rarityBadge
                        .opacity(rarityIsRevealed ? 1 : 0)
                        .accessibilityHidden(!rarityIsRevealed)
                    Image(systemName: "sparkles")
                        .font(.system(size: 42, weight: .light))
                        .foregroundStyle(V2Color.primary)
                    Text("一段记忆正在苏醒")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(V2Color.textPrimary)
                    Text("掌握 · \(currentCard.masteryStage.title)")
                        .font(V2Typography.caption)
                        .foregroundStyle(V2Color.textMuted)
                }
                .frame(width: 238, height: 318)
                .background(
                    RoundedRectangle(cornerRadius: 25, style: .continuous)
                        .fill(V2Color.surfaceCream)
                        .overlay(
                            RoundedRectangle(cornerRadius: 25, style: .continuous)
                                .stroke(
                                    rarityIsRevealed
                                        ? rarityAccentColor.opacity(0.56)
                                        : V2Color.textMuted.opacity(0.34),
                                    lineWidth: 1.5
                                )
                        )
                        .v2Shadow()
                )
                .shadow(
                    color: !reduceMotion && summonStage == .orbit
                        ? V2Color.textMuted.opacity(0.13)
                        : Color.clear,
                    radius: !reduceMotion && summonStage == .orbit ? 6 : 0,
                    y: !reduceMotion && summonStage == .orbit ? 4 : 0
                )
                .scaleEffect(summonCardScale)
                .offset(summonCardOffset)
                .rotationEffect(.degrees(summonCardRotation))
                .animation(
                    reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.8),
                    value: summonStage
                )
                .opacity(summonCardIsVisible ? 1 : 0)
                .animation(
                    reduceMotion ? nil : .easeOut(duration: 0.16),
                    value: summonCardIsVisible
                )
                .changeEffect(
                    .shine(duration: 0.5),
                    value: rarityIsRevealed && currentIndex == 0,
                    isEnabled: !reduceMotion
                )

                if summonStage == .cue {
                    if !reduceMotion {
                        Circle()
                            .fill(rarityAccentColor.opacity(0.08))
                            .frame(width: 220, height: 220)
                            .blur(radius: 30)
                            .offset(x: 126, y: 128)
                            .transition(.opacity)
                            .accessibilityHidden(true)
                    }
                }

                summonMascotView
                    .frame(width: 98, height: 98)
                    .scaleEffect(summonMascotScale)
                    .offset(summonMascotOffset)
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.76),
                        value: summonStage
                    )
                    .transition(.scale(scale: 0.88).combined(with: .opacity))
            }
            .frame(height: 350)

            Button("跳过过场") {
                finishSummon()
            }
            .font(V2Typography.bodySmallEmphasis)
            .foregroundStyle(V2Color.textSecondary)
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityHint("直接进入主动回忆")
        }
        .v2PageColumn()
    }

    private var summonCardScale: CGFloat {
        switch summonStage {
        case .turn, .approach, .rummage: 0.32
        case .carrying: 0.56
        case .orbit: 1.035
        case .settle, .cue: 1
        }
    }

    private var summonCardOffset: CGSize {
        switch summonStage {
        case .turn, .approach: CGSize(width: -126, height: 92)
        case .rummage: CGSize(width: -112, height: 64)
        case .carrying: CGSize(width: -38, height: 42)
        case .orbit: CGSize(width: -8, height: -12)
        case .settle, .cue: .zero
        }
    }

    private var summonCardRotation: Double {
        switch summonStage {
        case .turn, .approach: -8
        case .rummage: -5
        case .carrying: 4
        case .orbit: -3
        case .settle, .cue: 0
        }
    }

    private var summonCardIsVisible: Bool {
        switch summonStage {
        case .turn, .approach, .rummage, .carrying, .orbit: false
        case .settle, .cue: true
        }
    }

    private var summonMascotOffset: CGSize {
        switch summonStage {
        case .turn: CGSize(width: 126, height: 128)
        case .approach: CGSize(width: -48, height: 128)
        case .rummage: CGSize(width: -86, height: 112)
        case .carrying: CGSize(width: -12, height: 126)
        case .orbit, .settle, .cue: CGSize(width: 126, height: 128)
        }
    }

    private var summonMascotScale: CGFloat {
        summonStage == .rummage ? 0.94 : 1
    }

    /// 召回序列：run→rummage→carry-return→卡片升起→approve。
    /// 三段动作使用透明 PNG 图集（OmoFrameAtlasPlayer，阶段切换即中断）；
    /// settle/cue 用姿态表派生 approve。carry-return 图集帧内自带空白卡，
    /// 完整文字卡只在 settle/cue 以 100% 不透明出现，避免与图集空白卡重复。
    @ViewBuilder
    private var summonMascotView: some View {
        switch summonStage {
        case .turn, .approach:
            OmoFrameAtlasPlayer(
                assetName: "OmoMotionRunAtlas",
                posterAssetName: "OmoMotionRunPoster",
                columns: 6, rows: 6, frameCount: 32, fps: 24, loop: true
            )
        case .rummage:
            OmoFrameAtlasPlayer(
                assetName: "OmoMotionRummageAtlas",
                posterAssetName: "OmoMotionRummagePoster",
                columns: 6, rows: 6, frameCount: 32, fps: 24, loop: true
            )
        case .carrying, .orbit:
            OmoFrameAtlasPlayer(
                assetName: "OmoMotionCarryReturnAtlas",
                posterAssetName: "OmoMotionCarryReturnPoster",
                columns: 6, rows: 2, frameCount: 10, fps: 24, loop: false
            )
        case .settle, .cue:
            OmoMascotPoseView(pose: .approve, reduceMotion: reduceMotion)
        }
    }

    private var rarityIsRevealed: Bool {
        summonStage == .settle || summonStage == .cue
    }

    private var formalCard: some View {
        VStack(spacing: 18) {
            OmoMascotPoseView(pose: recallCompanionPose, reduceMotion: reduceMotion)
                .frame(width: 86, height: 86)
                .task(id: currentCard.id) {
                    // 安静注视陪伴；6.5 秒后最多一次 confused，不催促。
                    recallCompanionPose = .dazed
                    guard !recallCompanionHasConfused,
                          !reduceMotion,
                          !ProcessInfo.processInfo.isLowPowerModeEnabled else { return }
                    try? await Task.sleep(nanoseconds: 6_500_000_000)
                    guard !Task.isCancelled,
                          !isRevealed,
                          phase == .recall || phase == .scratching else { return }
                    recallCompanionHasConfused = true
                    recallCompanionPose = .confused
                    try? await Task.sleep(nanoseconds: 460_000_000)
                    guard !Task.isCancelled else { return }
                    recallCompanionPose = .dazed
                }

            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    rarityBadge
                    Spacer()
                    Text("掌握 · \(currentCard.masteryStage.title)")
                        .font(V2Typography.captionEmphasis)
                        .foregroundStyle(V2Color.primary)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(
                            Capsule()
                                .fill(V2Color.surfaceSageTint)
                                .overlay(
                                    Capsule()
                                        .stroke(V2Color.primary.opacity(0.35), lineWidth: 1)
                                )
                        )
                    sourceStatusLabel
                }

                if currentCard.groupCardCount > 1 || sourceContextSheetItem != nil {
                    sourceContextHeaderEntry
                }

                Text("先别看答案")
                    .font(V2Typography.captionEmphasis)
                    .foregroundStyle(V2Color.textMuted)

                Text(currentCard.card.recallCue)
                    .font(.system(.title3, design: .rounded, weight: .bold))
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
                    .overlay {
                        if let rarity = currentCard.card.rarity {
                            V2RarityMaterialOverlay(rarity: rarity, cornerRadius: 24)
                        }
                    }
                    .v2Shadow()
            )
            .overlay {
                if revealDebrisVisible, !reduceMotion {
                    V2RevealYarnDebrisView()
                        .offset(y: 52)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }

            if isRevealed {
                assessmentButtons
                    .transition(.opacity)
            } else if currentCard.masteryStage == .sealed || activeRecallVariant == nil {
                Button {
                    reveal()
                } label: {
                    HStack(spacing: 7) {
                        Image("RecallExpandIcon")
                            .resizable()
                            .renderingMode(.original)
                            .scaledToFit()
                            .frame(width: 28, height: 28)
                            .accessibilityHidden(true)
                        Text("直接揭晓")
                    }
                }
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textSecondary)
                .frame(minWidth: 44, minHeight: 44)
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
        .task(id: revealDebrisTicket) {
            // 毛线碎屑约 320ms 收拢回卡框后消失。
            guard revealDebrisTicket > 0 else { return }
            try? await Task.sleep(nanoseconds: 320_000_000)
            guard !Task.isCancelled else { return }
            revealDebrisVisible = false
        }
    }

    private var sourceContextSheetItem: V2SourceContextSheetItem? {
        guard let context = currentCard.card.sourceContext else { return nil }
        let hasNearbyText = !context.nearbyText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty
        let hasOverview = context.overview.map { overview in
            !overview.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !overview.highlights.isEmpty
        } ?? false
        guard hasNearbyText || hasOverview || !context.blocks.isEmpty else {
            return nil
        }
        return V2SourceContextSheetItem(
            cardID: currentCard.id,
            sourceTitle: currentCard.card.sourceTitle,
            groupCardCount: currentCard.groupCardCount,
            groupCardIndex: currentCard.groupCardIndex,
            context: context
        )
    }

    @ViewBuilder
    private var sourceContextHeaderEntry: some View {
        if sourceContextSheetItem != nil {
            Button {
                openSourceContext()
            } label: {
                sourceContextHeaderLabel(
                    detail: isRevealed ? "查看内容脉络" : "查看脉络并揭晓"
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("v2.source-context.open")
            .accessibilityLabel(isRevealed ? "查看内容脉络" : "查看脉络并揭晓")
            .accessibilityHint(
                isRevealed
                    ? "打开原内容并定位到当前截图附近"
                    : "先完整揭晓当前答案，再打开原内容并定位到当前截图附近"
            )
        } else {
            sourceContextHeaderLabel(detail: "内容脉络仍在补全")
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    "这份内容生成了 \(currentCard.groupCardCount) 张卡，当前 \(currentCard.groupCardIndex + 1) / \(currentCard.groupCardCount)，内容脉络仍在补全"
                )
        }
    }

    private func sourceContextHeaderLabel(detail: String) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(
                    currentCard.groupCardCount > 1
                        ? "这份内容生成了 \(currentCard.groupCardCount) 张卡 · 当前 \(currentCard.groupCardIndex + 1) / \(currentCard.groupCardCount)"
                        : "查看这张卡的来源位置"
                )
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

                Text(detail)
                    .font(V2Typography.caption)
                    .foregroundStyle(V2Color.textMuted)
            }

            Spacer(minLength: 8)

            V2CardStackGlyph()
                .accessibilityHidden(true)
        }
        .padding(.leading, 14)
        .padding(.trailing, 7)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .fill(V2Color.surfaceSageTint)
                .overlay(
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .stroke(V2Color.primary.opacity(0.28), lineWidth: 1)
                )
        )
    }

    @ViewBuilder
    private var rarityBadge: some View {
        if let rarity = currentCard.card.rarity {
            V2RarityBadge(rarity: rarity)
        } else {
            V2UngradedRarityBadge()
        }
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

            V2ScratchRevealCanvas(
                hiddenText: hiddenSemanticText,
                reduceMotion: reduceMotion,
                paths: $scratchPaths,
                coveredCells: $coveredScratchCells,
                coverage: $revealProgress,
                isDrawing: $isRevealDragging,
                onScratchStart: {
                    if phase == .recall {
                        phase = .scratching
                    }
                },
                onReveal: reveal
            )
            .scaleEffect(x: 1, y: isRevealDragging && !reduceMotion ? 1.01 : 1)
            .accessibilityIdentifier("v2.semantic-reveal")

            Image("RecallRevealTrack")
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
                .frame(height: 32)
                .opacity(revealProgress > 0 ? 0.62 : 0.42)
                .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: revealProgress)
                .accessibilityHidden(true)

            Text("铅笔笔刷 26pt；刮开 45% 后完整揭示，也可以直接揭晓")
                .font(V2Typography.caption)
                .foregroundStyle(V2Color.textMuted)
        }
    }

    private var maskedCoreKnowledge: String {
        let core = currentCard.card.coreKnowledge
        let hidden = hiddenSemanticText
        guard core.contains(hidden) else { return core }
        // 固定长度遮挡块，不泄露答案长度。
        return core.replacingOccurrences(
            of: hidden,
            with: String(repeating: "▰", count: 8)
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

            ForEach(rarityReasonTexts, id: \.self) { reason in
                Text(reason)
                    .font(V2Typography.caption)
                    .foregroundStyle(V2Color.textMuted)
            }

            screenshotPreview
            sourceFooter
        }
    }

    private var rarityReasonTexts: [String] {
        let reasons = ([currentCard.card.rarityReason].compactMap { $0 }
            + (currentCard.card.rarityReasons ?? []))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        return reasons.reduce(into: [String]()) { result, reason in
            if !result.contains(reason) {
                result.append(reason)
            }
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
                assessmentButton("没想起", assessment: .forgot, color: V2Color.textSecondary)
                assessmentButton("想偏了", assessment: .fuzzy, color: Color(hex: 0xD3A34A))
                assessmentButton("想对了", assessment: .remembered, color: V2Color.primary)
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
        .disabled(phase != .revealed)
        .accessibilityIdentifier("v2.assessment.\(assessment.rawValue)")
    }

    private var feedbackLanding: some View {
        VStack(spacing: 20) {
            ZStack {
                if assessment != .remembered {
                    Image("OmoParticlePuff")
                        .resizable()
                        .renderingMode(.template)
                        .foregroundStyle(V2Color.textMuted.opacity(0.14))
                        .frame(width: 178, height: 178)
                        .accessibilityHidden(true)
                }

                OmoMascotPoseView(pose: feedbackDisplayPose, reduceMotion: reduceMotion)
                    .frame(width: 164, height: 164)
                    .offset(y: forgotReactionActive ? 6 : 0)
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.36, dampingFraction: 0.68),
                        value: forgotReactionActive
                    )
                    .changeEffect(
                        .jump(height: 18),
                        value: assessmentReactionTick,
                        isEnabled: assessment == .remembered && !reduceMotion
                    )
                    .changeEffect(
                        .spray(origin: .center) {
                            Image("OmoParticleSpark")
                                .resizable()
                                .renderingMode(.template)
                                .foregroundStyle(Color(hex: 0xE8B44C))
                                .frame(width: 10, height: 10)
                        },
                        value: assessmentReactionTick,
                        isEnabled: assessment == .remembered && !reduceMotion
                    )
            }
            .frame(width: 230, height: 180)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(feedbackMascotAccessibilityLabel)

            Text(feedbackTitle)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)

            Text(feedbackDetail)
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)
                .multilineTextAlignment(.center)

            if phase == .assessing && assessmentError.isEmpty {
                ProgressView()
                    .tint(V2Color.primary)
                    .accessibilityLabel("正在保存复习结果")
            }

            if !assessmentError.isEmpty {
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
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    V2Color.primary.opacity(
                        assessment == .remembered && phase == .assessing ? 0.25 : 0
                    ),
                    lineWidth: 2
                )
                .animation(
                    reduceMotion ? nil : .easeInOut(duration: 0.6),
                    value: phase
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    V2Color.textMuted.opacity(
                        assessment == .fuzzy && phase == .assessing
                            ? (fuzzyBreathActive ? 0.4 : 0.15)
                            : 0
                    ),
                    lineWidth: 1.5
                )
                .animation(
                    reduceMotion ? nil : .easeInOut(duration: 0.8),
                    value: fuzzyBreathActive
                )
        )
        .task(id: assessmentReactionTick) {
            // 想对了 approve→heart；想偏了 confused→安静陪伴；没想起保持陪伴姿态。
            guard assessmentReactionTick > 0,
                  phase == .assessing else { return }
            switch assessment {
            case .remembered:
                feedbackPose = .approve
                try? await Task.sleep(nanoseconds: reduceMotion ? 150_000_000 : 560_000_000)
                guard !Task.isCancelled else { return }
                feedbackPose = .heart
            case .fuzzy:
                feedbackPose = .confused
                if !reduceMotion {
                    withAnimation(.easeInOut(duration: 0.26)) {
                        fuzzyBreathActive = true
                    }
                }
                try? await Task.sleep(nanoseconds: reduceMotion ? 150_000_000 : 760_000_000)
                guard !Task.isCancelled else { return }
                feedbackPose = .dazed
                if !reduceMotion {
                    withAnimation(.easeOut(duration: 0.22)) {
                        fuzzyBreathActive = false
                    }
                }
            case .forgot:
                feedbackPose = .dazed
                guard !reduceMotion else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.68)) {
                    forgotReactionActive = true
                }
                try? await Task.sleep(nanoseconds: 420_000_000)
                guard !Task.isCancelled else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    forgotReactionActive = false
                }
            default:
                break
            }
        }
    }

    private var pausedLanding: some View {
        VStack(spacing: 18) {
            Spacer()
            V2RecallMascotView(state: .sleeping, reduceMotion: reduceMotion)
                .frame(width: 150, height: 150)
            Text("这段回忆先停在这里")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)
            Text("回到 App 后会从同一张卡、同一处刮痕继续。")
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .v2PageColumn()
        .accessibilityElement(children: .contain)
    }

    private var stowingLanding: some View {
        VStack(spacing: 20) {
            Spacer()

            ZStack {
                Image("RecallFolder")
                    .resizable()
                    .renderingMode(.original)
                    .scaledToFit()
                    .frame(width: 180, height: 180)
                    .offset(y: 52)
                    .accessibilityHidden(true)

                Image("RecallCardSurface")
                    .resizable()
                    .renderingMode(.original)
                    .scaledToFit()
                    .frame(width: 164, height: 122)
                    .scaleEffect(stowCardScale)
                    .offset(y: stowCardOffset)
                    .opacity(stowCardOpacity)
                    .rotationEffect(.degrees(stowStage == .cardReady ? -3 : 0))
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.8),
                        value: stowStage
                    )
                    .accessibilityHidden(true)

                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(V2Color.pageGreenBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .stroke(V2Color.primary.opacity(0.28), lineWidth: 1)
                    )
                    .frame(width: 172, height: 78)
                    .rotation3DEffect(
                        .degrees(stowStage == .cardReady || stowStage == .dropping ? -68 : 0),
                        axis: (x: 1, y: 0, z: 0),
                        anchor: .bottom,
                        perspective: 0.55
                    )
                    .offset(y: 74)
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.82),
                        value: stowStage
                    )
                    .accessibilityHidden(true)

                OmoMascotPoseView(
                    pose: stowStage == .farewell ? .farewell : .run,
                    reduceMotion: reduceMotion
                )
                .frame(width: 104, height: 104)
                .offset(x: 108, y: stowStage == .farewell ? -64 : 36)
                .animation(
                    reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.72),
                    value: stowStage
                )
            }
            .frame(height: 270)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(stowStage == .farewell ? "记忆伙伴把卡收好并挥手告别" : "正在把卡放回收藏夹")

            Text(stowStage == .farewell ? "记忆已经收好了" : "正在把记忆放回收藏夹")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)
            Text(stowStage == .farewell ? "下次需要时，它会带着这张卡回来。" : "卡片和当前进度都会被保留。")
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)

            Button("跳过动画") {
                finishStow()
            }
            .font(V2Typography.bodySmallEmphasis)
            .foregroundStyle(V2Color.textSecondary)
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityHint("立即完成收好并返回")

            Spacer()
        }
        .v2PageColumn()
        .task(id: "stow-\(currentCard.id)") {
            stowStage = .cardReady
            if reduceMotion {
                try? await Task.sleep(nanoseconds: 180_000_000)
                guard !Task.isCancelled, phase == .stowing else { return }
                stowStage = .farewell
                try? await Task.sleep(nanoseconds: 180_000_000)
                guard !Task.isCancelled, phase == .stowing else { return }
                finishStow()
                return
            }
            guard await advanceStow(after: 160_000_000, to: .dropping) else { return }
            guard await advanceStow(after: 460_000_000, to: .closing) else { return }
            guard await advanceStow(after: 320_000_000, to: .farewell) else { return }
            try? await Task.sleep(nanoseconds: 620_000_000)
            guard !Task.isCancelled, phase == .stowing else { return }
            finishStow()
        }
    }

    private var stowCardScale: CGFloat {
        switch stowStage {
        case .cardReady: 0.78
        case .dropping: 0.34
        case .closing, .farewell: 0.24
        }
    }

    private var stowCardOffset: CGFloat {
        switch stowStage {
        case .cardReady: -72
        case .dropping: 46
        case .closing, .farewell: 54
        }
    }

    private var stowCardOpacity: Double {
        switch stowStage {
        case .cardReady: 1
        case .dropping: 0.82
        case .closing, .farewell: 0
        }
    }

    private var repairingLanding: some View {
        VStack(spacing: 18) {
            ZStack {
                if !reduceMotion {
                    Image("OmoParticleGlow")
                        .resizable()
                        .renderingMode(.template)
                        .foregroundStyle(V2Color.primary.opacity(0.12))
                        .frame(width: 190, height: 190)
                        .accessibilityHidden(true)
                }

                OmoMascotPoseView(pose: .approve, reduceMotion: reduceMotion)
                    .frame(width: 164, height: 164)
            }
            .frame(height: 184)
            .accessibilityHidden(true)

            Text("这段记忆已经修复")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)

            Text("正在把本次主动回忆与下次复习时间一起收进收藏册。")
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)
                .multilineTextAlignment(.center)
        }
        .v2PageColumn()
        .padding(.top, 34)
        .padding(.bottom, 36)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("记忆修复完成，正在收入收藏册")
        .task(id: currentReviewCycleKey) {
            try? await Task.sleep(
                nanoseconds: reduceMotion ? 180_000_000 : 620_000_000
            )
            guard !Task.isCancelled, phase == .repairing else { return }
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.24)) {
                phase = .checkpoint
            }
        }
    }

    private var archiveLanding: some View {
        VStack(spacing: 18) {
            ZStack(alignment: .bottomTrailing) {
                if currentIndex + 1 < session.cards.count {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(V2Color.surfaceCream.opacity(0.76))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(V2Color.primary.opacity(0.22), lineWidth: 1)
                        )
                        .frame(height: 92)
                        .offset(x: 24, y: 26)
                        .rotationEffect(.degrees(reduceMotion ? 0 : 3))
                        .accessibilityLabel("下一张记忆卡已准备好")
                }

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
            }

            OmoMascotPoseView(pose: .confused, reduceMotion: reduceMotion)
                .frame(width: 92, height: 92)

            Text("记忆已修复并入册")
                .font(.system(.title2, design: .rounded, weight: .bold))
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

                Text("掌握 · \(masteryBefore.title) → \(masteryAfter.title) · \(currentSchedule?.displayText ?? "下次复习时间待同步")")
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

            V2PrimaryActionButton(
                title: currentIndex + 1 < session.cards.count ? "继续下一张" : "今天先到这里",
                tone: .normal
            ) {
                if currentIndex + 1 < session.cards.count {
                    advanceToNextCard()
                } else {
                    stowAndClose()
                }
            }
            .accessibilityHint(
                currentIndex + 1 < session.cards.count
                    ? "只取回下一张，完成后仍可停止"
                    : "把这张卡先收好"
            )

            Button("先收好", action: stowAndClose)
                .frame(minWidth: 44, minHeight: 44)
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

    private var ungradedFormalCard: some View {
        VStack(spacing: 18) {
            V2UngradedRarityBadge()

            OmoMascotPoseView(pose: .confused, reduceMotion: reduceMotion)
                .frame(width: 150, height: 150)

            Text("这张卡尚未完成知识分级")
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)
                .multilineTextAlignment(.center)

            Text("内容已安全保存在知识库；完成 R / SR / SSR 分级前，不会进入抽取、反馈或复习调度。")
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textSecondary)
                .multilineTextAlignment(.center)

            V2PrimaryActionButton(title: "暂不复习，返回") {
                clearPersistedPresentation()
                onClose()
            }
        }
        .v2PageColumn()
        .padding(.top, 24)
        .padding(.bottom, 36)
        .accessibilityElement(children: .contain)
    }

    private var fragmentCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("记忆碎片 · \(sourceStatusTitle)", systemImage: "sparkles.rectangle.stack")
                .font(V2Typography.bodySmallEmphasis)
                .foregroundStyle(V2Color.textMuted)

            Text(currentCard.card.coreKnowledge)
                .font(.system(.title3, design: .rounded, weight: .bold))
                .foregroundStyle(V2Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            screenshotPreview

            Text(currentCard.card.explanation)
                .font(V2Typography.body)
                .foregroundStyle(V2Color.textSecondary)

            Text(currentCard.card.recallCue)
                .font(V2Typography.bodySmall)
                .foregroundStyle(V2Color.textMuted)

            V2PrimaryActionButton(title: "碎片已保存，返回知识库") {
                stowAndClose()
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

    private var rarityAccentColor: Color {
        guard let rarity = currentCard.card.rarity else {
            return V2Color.textMuted
        }
        return V2RarityVisualStyle(rarity).accent
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

    private var scenePalette: V2RecallScenePalette {
        switch phase {
        case .home: return .creamReady
        case .summoning, .assessing: return .mistProcessing
        case .recall, .scratching: return .coralRecall
        case .revealed: return .creamReady
        case .repairing, .checkpoint, .stowing: return .sageLibrary
        case .paused: return colorScheme == .dark ? .navyNight : .lavenderPaused
        }
    }

    private var sceneBackgroundColor: Color {
        switch scenePalette {
        case .creamReady: return Color(hex: 0xFFF6E8)
        case .mistProcessing: return Color(hex: 0xE9EEF0)
        case .coralRecall: return Color(hex: 0xF7C6B1)
        case .lavenderPaused: return Color(hex: 0xE7E0EF)
        case .sageLibrary: return Color(hex: 0xDCE7D5)
        case .navyNight: return Color(hex: 0x26384D)
        }
    }

    private var feedbackDisplayPose: OmoMascotPose {
        // 错误才 dejected；其余反馈姿态由 assessmentReactionTick 驱动。
        if !assessmentError.isEmpty { return .dejected }
        return feedbackPose
    }

    private var feedbackMascotAccessibilityLabel: String {
        switch assessment {
        case .remembered: "记忆反馈：想对了"
        case .fuzzy: "记忆反馈：想偏了"
        case .forgot: "记忆反馈：没想起"
        case nil: "记忆反馈：处理中"
        }
    }

    private var feedbackTitle: String {
        if !assessmentError.isEmpty { return "结果还没有保存" }
        switch assessment {
        case .remembered: return "这段记忆更清晰了"
        case .fuzzy: return "已经找到一点轮廓"
        case .forgot: return "没关系，下次再修复"
        case nil: return "正在安排下次召回"
        }
    }

    private var feedbackDetail: String {
        if !assessmentError.isEmpty {
            return "保留当前选择并重试，不会重复记录。"
        }
        return switch assessment {
        case .remembered: "这次主动重建已经记录好了。"
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
            phase = .revealed
        }
        if !reduceMotion {
            revealDebrisVisible = true
            revealDebrisTicket &+= 1
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        UIAccessibility.post(
            notification: .announcement,
            argument: "已完整揭晓，答案与解析已展开"
        )
    }

    private func openSourceContext() {
        guard let sourceContextSheetItem else { return }
        if !isRevealed {
            reveal()
        }
        activeSourceContext = sourceContextSheetItem
    }

    private func answerVariant(_ isCorrect: Bool) {
        variantFeedback = isCorrect
            ? "回答正确 · 现在检查证据"
            : "这次没有答对 · 不扣分，只会更早复习"
        reveal()
    }

    private func completeAssessment(_ value: V2MemoryAssessment) {
        guard currentCard.isReadyForReview else { return }
        guard pendingAssessment == nil, phase == .revealed else { return }
        guard !assessedReviewCycles.contains(currentReviewCycleKey) else {
            phase = .checkpoint
            return
        }
        masteryBefore = currentCard.masteryStage
        masteryAfter = currentCard.masteryStage.applying(value)
        assessment = value
        switch value {
        case .remembered: feedbackPose = .approve
        case .fuzzy: feedbackPose = .confused
        case .forgot: feedbackPose = .dazed
        }
        pendingAssessment = V2PendingScreenshotAssessment(
            assessment: value,
            attemptId: "ios-capture-assessment-\(currentReviewCycleKey)"
        )
        assessmentError = ""
        assessmentReactionTick &+= 1
        fuzzyBreathActive = false
        forgotReactionActive = false
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.34, dampingFraction: 0.78)) {
            phase = .assessing
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
                phase = .assessing
            }
            do {
                let completedReviewCycleKey = currentReviewCycleKey
                let response = try await onAssessment(
                    currentCard.id,
                    pendingAssessment.assessment,
                    pendingAssessment.attemptId
                )
                guard !Task.isCancelled else { return }
                let canonicalAssessment = response.canonicalAssessment(fallback: pendingAssessment.assessment)
                currentSchedule = response.schedule
                assessment = canonicalAssessment
                if let serverMastery = response.mastery {
                    masteryBefore = V2MemoryMasteryStage(rawServerValue: serverMastery.before)
                        ?? currentCard.masteryStage
                    masteryAfter = V2MemoryMasteryStage(rawServerValue: serverMastery.after)
                        ?? currentCard.masteryStage.applying(canonicalAssessment)
                }
                self.pendingAssessment = nil
                withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.24)) {
                    var updatedReviewCycles = assessedReviewCycles
                    updatedReviewCycles.insert(completedReviewCycleKey)
                    persistedAssessedReviewCycles = updatedReviewCycles.sorted().suffix(64).joined(separator: ",")
                    phase = .repairing
                }
            } catch is CancellationError {
                return
            } catch {
                assessmentError = error.localizedDescription
                withAnimation(.easeOut(duration: 0.18)) {
                    phase = .assessing
                }
            }
        }
    }

    private func advanceToNextCard() {
        guard currentIndex + 1 < session.cards.count else {
            stowAndClose()
            return
        }
        let animation: Animation? = reduceMotion ? nil : .easeOut(duration: 0.18)
        withAnimation(animation) {
            currentIndex += 1
            phase = .summoning
            summonStage = .turn
            isRevealed = false
            revealProgress = 0
            isRevealDragging = false
            assessment = nil
            currentSchedule = session.cards[currentIndex].schedule
            presentationReviewCycleKey = session.cards[currentIndex]
                .reviewCycleKey(scheduleOverride: currentSchedule)
            pendingAssessment = nil
            assessmentError = ""
            variantFeedback = ""
            recallCompanionPose = .dazed
            recallCompanionHasConfused = false
            fuzzyBreathActive = false
            forgotReactionActive = false
            scratchPaths = []
            coveredScratchCells = []
            revealDebrisVisible = false
        }
        persistPresentationState()
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private var currentReviewCycleKey: String {
        presentationReviewCycleKey.isEmpty
            ? currentCard.reviewCycleKey(scheduleOverride: currentSchedule)
            : presentationReviewCycleKey
    }

    private var assessedReviewCycles: Set<String> {
        Set(
            persistedAssessedReviewCycles
                .split(separator: ",")
                .map(String.init)
                .filter { !$0.isEmpty }
        )
    }

    private func stowAndClose() {
        assessmentTask?.cancel()
        stowStage = .cardReady
        stowCompletionHandled = false
        withAnimation(reduceMotion ? .easeOut(duration: 0.18) : .spring(response: 0.4, dampingFraction: 0.82)) {
            phase = .stowing
        }
    }

    private func stablePhase(for candidate: V2RecallPresentationPhase) -> V2RecallPresentationPhase {
        switch candidate {
        case .summoning:
            return .recall
        case .assessing:
            return isRevealed ? .revealed : .recall
        case .repairing:
            return .checkpoint
        case .stowing:
            return .checkpoint
        case .paused:
            return phaseBeforePause
        default:
            return candidate
        }
    }

    private func persistPresentationState() {
        persistedCardID = currentCard.id
        persistedPresentationReviewCycleKey = currentReviewCycleKey
        persistedCurrentIndex = currentIndex
        persistedPhase = stablePhase(for: phase).rawValue
        persistedRevealCoverage = Double(revealProgress)
        persistedIsRevealed = isRevealed
        persistedCoveredCells = coveredScratchCells.sorted().joined(separator: ",")
        persistedScratchPaths = scratchPaths.map { points in
            points.map { point in
                "\(point.x):\(point.y)"
            }.joined(separator: ";")
        }.joined(separator: "|")
        persistedAssessment = assessment?.rawValue ?? ""
        persistedMasteryBefore = masteryBefore.rawValue
        persistedMasteryAfter = masteryAfter.rawValue
        persistedScheduleNextReviewAt = currentSchedule?.nextReviewAt ?? ""
        persistedScheduleIntervalDays = currentSchedule?.intervalDays ?? 0
        persistedScheduleState = currentSchedule?.state ?? ""
        persistedScheduleStatus = currentSchedule?.status ?? ""
    }

    private func restorePersistedState() {
        let restoredIndex = min(max(0, persistedCurrentIndex), session.cards.count - 1)
        let restoredCard = session.cards[restoredIndex]
        guard restoredCard.matchesPersistedPresentation(
            cardID: persistedCardID,
            reviewCycleKey: persistedPresentationReviewCycleKey
        ) else {
            resetPresentationForCurrentCycle()
            return
        }

        currentIndex = restoredIndex
        presentationReviewCycleKey = persistedPresentationReviewCycleKey
        currentSchedule = persistedScheduleNextReviewAt.isEmpty
            ? currentCard.schedule
            : ImageFlowReviewSchedule(
                nextReviewAt: persistedScheduleNextReviewAt,
                intervalDays: persistedScheduleIntervalDays,
                state: persistedScheduleState,
                status: persistedScheduleStatus.isEmpty ? nil : persistedScheduleStatus
            )
        assessment = V2MemoryAssessment(rawValue: persistedAssessment)
        masteryBefore = V2MemoryMasteryStage(rawValue: persistedMasteryBefore) ?? currentCard.masteryStage
        masteryAfter = V2MemoryMasteryStage(rawValue: persistedMasteryAfter) ?? masteryBefore
        revealProgress = CGFloat(persistedRevealCoverage)
        isRevealed = persistedIsRevealed
        let restoredCoveredScratchCells = Set(
            persistedCoveredCells.split(separator: ",").map(String.init)
        )
        let restoredScratchPaths: [[CGPoint]] = persistedScratchPaths.split(separator: "|").map { rawPath in
            rawPath.split(separator: ";").compactMap { rawPoint -> CGPoint? in
                let values = rawPoint.split(separator: ":")
                guard values.count == 2,
                      let x = Double(values[0]),
                      let y = Double(values[1]) else { return nil }
                return CGPoint(x: x, y: y)
            }
        }
        let scratchPointsAreNormalized = restoredScratchPaths
            .flatMap { $0 }
            .allSatisfy { point in
                (0...1).contains(point.x) && (0...1).contains(point.y)
            }
        if scratchPointsAreNormalized {
            coveredScratchCells = restoredCoveredScratchCells
            scratchPaths = restoredScratchPaths
        } else {
            scratchPaths = []
            coveredScratchCells = []
            if !isRevealed {
                revealProgress = 0
            }
        }

        let restoredPhase = V2RecallPresentationPhase(rawValue: persistedPhase) ?? .recall
        if assessedReviewCycles.contains(currentReviewCycleKey) {
            phase = .checkpoint
        } else if isRevealed {
            phase = .revealed
        } else {
            phase = stablePhase(for: restoredPhase)
        }
        phaseBeforePause = phase
    }

    private func resetPresentationForCurrentCycle() {
        currentIndex = 0
        let card = session.cards[0]
        currentSchedule = card.schedule
        presentationReviewCycleKey = card.reviewCycleKey(scheduleOverride: card.schedule)
        phase = .summoning
        phaseBeforePause = .recall
        summonStage = .turn
        stowStage = .cardReady
        isRevealed = false
        revealProgress = 0
        isRevealDragging = false
        assessment = nil
        masteryBefore = card.masteryStage
        masteryAfter = card.masteryStage
        pendingAssessment = nil
        assessmentError = ""
        variantFeedback = ""
        recallCompanionPose = .dazed
        recallCompanionHasConfused = false
        feedbackPose = .dazed
        assessmentReactionTick = 0
        fuzzyBreathActive = false
        forgotReactionActive = false
        scratchPaths = []
        coveredScratchCells = []
        revealDebrisVisible = false
    }

    private func clearPersistedPresentation() {
        persistedCardID = ""
        persistedPresentationReviewCycleKey = ""
        persistedCurrentIndex = 0
        persistedPhase = V2RecallPresentationPhase.home.rawValue
        persistedRevealCoverage = 0
        persistedIsRevealed = false
        persistedScratchPaths = ""
        persistedCoveredCells = ""
        persistedAssessment = ""
        persistedMasteryBefore = V2MemoryMasteryStage.sealed.rawValue
        persistedMasteryAfter = V2MemoryMasteryStage.sealed.rawValue
        persistedScheduleNextReviewAt = ""
        persistedScheduleIntervalDays = 0
        persistedScheduleState = ""
        persistedScheduleStatus = ""
    }

    private func finishSummon() {
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.18)) {
            phase = .recall
        }
    }

    private func finishStow() {
        guard phase == .stowing, !stowCompletionHandled else { return }
        stowCompletionHandled = true
        clearPersistedPresentation()
        onClose()
    }

    private func advanceStow(
        after nanoseconds: UInt64,
        to nextStage: V2ScreenshotStowVisualStage
    ) async -> Bool {
        try? await Task.sleep(nanoseconds: nanoseconds)
        guard !Task.isCancelled, phase == .stowing else { return false }
        withAnimation(.spring(response: 0.34, dampingFraction: 0.8)) {
            stowStage = nextStage
        }
        return true
    }

    private func advanceSummon(
        after nanoseconds: UInt64,
        to nextStage: V2ScreenshotSummonVisualStage
    ) async -> Bool {
        try? await Task.sleep(nanoseconds: nanoseconds)
        guard !Task.isCancelled, phase == .summoning else { return false }
        let spring: Animation = nextStage == .cue
            ? .spring(response: 0.28, dampingFraction: 0.68)
            : .spring(response: 0.32, dampingFraction: 0.78)
        withAnimation(spring) {
            summonStage = nextStage
        }
        return true
    }
}

/// 揭示完成时的一缕轻量毛线碎屑：从刮开区收拢回卡框，约 320ms。
/// 纯 SwiftUI 位移/旋转/淡出不新增素材；Reduce Motion 下不出现。
private struct V2RevealYarnDebrisView: View {
    @State private var gathered = false

    private let bits: [(start: CGSize, end: CGSize, angle: Double, length: CGFloat, tint: Int)] = [
        (CGSize(width: -54, height: 46), CGSize(width: -8, height: 2), -0.6, 9, 0),
        (CGSize(width: -22, height: 62), CGSize(width: -3, height: -2), 0.4, 7, 1),
        (CGSize(width: 8, height: 70), CGSize(width: 0, height: 0), -0.2, 10, 0),
        (CGSize(width: 34, height: 58), CGSize(width: 4, height: -3), 0.7, 7, 2),
        (CGSize(width: 58, height: 40), CGSize(width: 9, height: 1), -0.5, 8, 1),
        (CGSize(width: -38, height: 30), CGSize(width: -6, height: -4), 0.9, 6, 0)
    ]

    var body: some View {
        ZStack {
            ForEach(bits.indices, id: \.self) { index in
                let bit = bits[index]
                Capsule(style: .continuous)
                    .fill(color(for: bit.tint))
                    .frame(width: bit.length, height: 2.4)
                    .rotationEffect(.radians(bit.angle + (gathered ? 0.5 : 0)))
                    .offset(gathered ? bit.end : bit.start)
                    .opacity(gathered ? 0 : 0.9)
            }
        }
        .frame(width: 1, height: 1)
        .onAppear {
            withAnimation(.easeOut(duration: 0.32)) {
                gathered = true
            }
        }
    }

    private func color(for tint: Int) -> Color {
        switch tint {
        case 0: V2Color.primary
        case 1: Color(hex: 0xD3A34A)
        default: V2Color.textMuted
        }
    }
}
