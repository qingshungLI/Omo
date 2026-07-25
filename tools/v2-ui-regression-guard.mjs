#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const files = {
  questionComponents: resolve(repoRoot, "拾贝/拾贝/V2/Components/Flow/V2QuestionComponents.swift"),
  reviewFlowScreens: resolve(repoRoot, "拾贝/拾贝/V2/Screens/Review/V2ReviewFlowScreens.swift"),
  awakeningViews: resolve(repoRoot, "拾贝/拾贝/V2/Screens/Home/V2AwakeningViews.swift"),
  awakeningModels: resolve(repoRoot, "拾贝/拾贝/V2/Models/V2AwakeningModels.swift"),
  screenshotAwakeningViews: resolve(repoRoot, "拾贝/拾贝/V2/Screens/Home/V2ScreenshotAwakeningViews.swift"),
  screenshotMemoryModels: resolve(repoRoot, "拾贝/拾贝/V2/Models/V2ScreenshotMemoryModels.swift"),
  tabScreens: resolve(repoRoot, "拾贝/拾贝/V2/Screens/Tabs/V2TabScreens.swift"),
  v2Root: resolve(repoRoot, "拾贝/拾贝/V2/V2RootView.swift"),
  apiClient: resolve(repoRoot, "拾贝/拾贝/Services/APIClient.swift"),
  apiClientTests: resolve(repoRoot, "拾贝/拾贝Tests/APIClientDecodingTests.swift"),
  webDemo: resolve(repoRoot, "docs/ios-app-demo.html")
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")])
);
const rarityPresentationPath = resolve(
  repoRoot,
  "拾贝/拾贝/V2/Components/Cards/V2RarityPresentation.swift"
);
const rarityPresentationSource = existsSync(rarityPresentationPath)
  ? readFileSync(rarityPresentationPath, "utf8")
  : "";
const matchingCardSource = extractMatchingCardSource(source.questionComponents);
const matchingScreenSource = extractMatchingScreenSource(source.reviewFlowScreens);
const awakeningHomeSource = extractBetween(
  source.awakeningViews,
  "struct V2AwakeningHomeView",
  "struct V2AwakeningFlowView"
);
const awakeningHomeDeclarationSource = extractBetween(
  awakeningHomeSource,
  "struct V2AwakeningHomeView",
  "var body: some View"
);
const awakeningHomeContentSource = extractBetween(
  awakeningHomeSource,
  "private var homeContent",
  "private var actionTitle"
);
const screenshotDrawSource = extractBetween(
  awakeningHomeSource,
  "private func drawScreenshotMemory()",
  "private var homeSubtitle"
);
const awakeningHomeCallSource = extractBetween(
  source.v2Root,
  "V2AwakeningHomeView(",
  "case .materials:"
);
const recallPhaseSource = extractBetween(
  source.awakeningViews,
  "enum V2RecallPresentationPhase",
  "enum V2RecallMascotState"
);
const mascotViewSource = extractBetween(
  source.awakeningViews,
  "struct V2RecallMascotView",
  "struct V2AdaptiveRecallMascotView"
);
const memoryCardStackSource = extractBetween(
  source.awakeningViews,
  "private struct V2MemoryCardStack",
  "private var isDragging"
);
const iosMascotAssetPath = resolve(
  repoRoot,
  "拾贝/拾贝/Assets.xcassets/RecallMascotShell.imageset/IP1-1.svg"
);
const webMascotAssetPath = resolve(
  repoRoot,
  "docs/app-demo-assets/mascot-v06/IP1-1.svg"
);
const repairingLandingSource = extractBetween(
  source.screenshotAwakeningViews,
  "private var repairingLanding",
  "private var archiveLanding"
);
const summonTaskSource = extractBetween(
  source.screenshotAwakeningViews,
  ".task(id: summonTaskID)",
  ".onAppear"
);
const summonTransitionSource = extractBetween(
  source.screenshotAwakeningViews,
  "private var summonTransition",
  "private var summonCardScale"
);
const scratchCanvasSource = extractBetween(
  source.screenshotAwakeningViews,
  "private struct V2ScratchRevealCanvas",
  "struct V2ScreenshotAwakeningFlowView"
);
const drawSessionSource = extractBetween(
  source.screenshotMemoryModels,
  "struct V2ScreenshotDrawSession",
  "private enum V2ScreenshotDateParser"
);
const capturedMemoryCardSource = extractBetween(
  source.screenshotMemoryModels,
  "struct V2CapturedMemoryCard",
  "extension CaptureMemoryCardAssessmentResponse"
);
const captureApplySource = extractBetween(source.screenshotMemoryModels, "mutating func apply(", "func reviewCycleKey(");
const rootAssessmentSource = extractBetween(source.v2Root, "private func applyScreenshotAssessment(", "private func deleteScreenshotMemoryCard(");
const submitAssessmentSource = extractBetween(source.screenshotAwakeningViews, "private func submitPendingAssessment(", "private func advanceToNextCard(");
const completeAssessmentSource = extractBetween(
  source.screenshotAwakeningViews,
  "private func completeAssessment(",
  "private func retryAssessment("
);
const reviewableScreenshotCardsSource = extractBetween(
  source.v2Root,
  "private var reviewableScreenshotCards",
  "private var screenshotPoolCounts"
);
const screenshotAnalysisSource = extractBetween(
  source.v2Root,
  "private func startScreenshotAnalysisAfterConsent(",
  "private func openScreenshotDraw("
);
const formalCardSource = extractBetween(
  source.screenshotAwakeningViews,
  "private var formalCard",
  "private var sourceStatusLabel"
);
const revealedContentSource = extractBetween(
  source.screenshotAwakeningViews,
  "private var revealedContent",
  "private var screenshotPreview"
);
const archiveLandingSource = extractBetween(
  source.screenshotAwakeningViews,
  "private var archiveLanding",
  "private func masteryStep("
);
const libraryCardSource = extractBetween(
  source.tabScreens,
  "private struct V2MemoryLibraryCard",
  "private enum V2MaterialsMascotMetrics"
);
const rarityBranchingOutsidePresentation = [
  source.screenshotAwakeningViews,
  source.screenshotMemoryModels,
  source.tabScreens,
  source.v2Root
].join("\n");
const rarityFallbackSource = [
  rarityBranchingOutsidePresentation,
  rarityPresentationSource
].join("\n");
const summonTimingTotals = extractSummonTimingTotals(summonTaskSource);

const checks = [
  check(
    "matching_card_uses_external_width",
    /\.frame\(width: width(?:,|\))/.test(matchingCardSource),
    "V2MatchingOptionCard must use its width parameter, not a private fixed width."
  ),
  check(
    "matching_card_uses_external_exact_height",
    /\.frame\(width: width,\s*height: height\)/.test(matchingCardSource),
    "V2MatchingOptionCard must use its height parameter as the exact semantic height for the estimated line count."
  ),
  check(
    "matching_card_uses_external_horizontal_padding",
    /\.padding\(\.horizontal,\s*horizontalPadding\)/.test(matchingCardSource),
    "V2MatchingOptionCard must use its horizontalPadding parameter."
  ),
  check(
    "matching_card_has_no_outer_vertical_padding",
    !/ZStack\s*\{[\s\S]*?\}\s*\.padding\(\.vertical,/.test(matchingCardSource),
    "V2MatchingOptionCard must not add vertical padding around the whole card because it makes visual row gaps drift."
  ),
  check(
    "matching_card_has_no_private_fixed_width_metrics",
    !/static let (width|minHeight|textWidth): CGFloat =/.test(extractMatchingCardPrivateMetrics(source.questionComponents)),
    "V2MatchingOptionCard must not hide fixed width/minHeight/textWidth inside its private Metrics."
  ),
  check(
    "matching_screen_passes_card_metrics",
    /width:\s*V2MatchingPageMetrics\.optionCardWidth/.test(matchingScreenSource)
      && /let cardHeight = V2MatchingPageMetrics\.optionCardHeight\(for:\s*question\.matchingPairs\)/.test(matchingScreenSource)
      && /height:\s*cardHeight/.test(matchingScreenSource)
      && /horizontalPadding:\s*V2MatchingPageMetrics\.optionCardHorizontalPadding/.test(matchingScreenSource),
    "V2MatchingQuestionView must pass screen metrics into V2MatchingOptionCard."
  ),
  check(
    "matching_screen_uses_uniform_dynamic_heights",
    /static func optionCardHeight\(for pairs: \[V2MatchingPairData\]\) -> CGFloat/.test(matchingScreenSource)
      && /optionCardOneLineHeight/.test(matchingScreenSource)
      && /optionCardTwoLineHeight/.test(matchingScreenSource)
      && /optionCardThreeLineHeight/.test(matchingScreenSource),
    "Matching option cards should use one uniform compact height per question based on the longest option."
  ),
  check(
    "matching_screen_has_no_per_option_height",
    !/optionCardHeight\(for:\s*pair\.(left|right)\)|rowHeights|optionRowHeights/.test(matchingScreenSource),
    "Matching screen must keep all option cards in one question at the same height."
  ),
  check(
    "awakening_home_has_one_screenshot_recall_action",
    countOccurrences(awakeningHomeContentSource, "drawScreenshotMemory()") === 2
      && /onContinuousScreenshotDraw\(preferredPool\)/.test(screenshotDrawSource)
      && !/\blet onDrawScreenshot\b/.test(awakeningHomeDeclarationSource)
      && !/\blet onDraw:\s*\(\)/.test(awakeningHomeDeclarationSource)
      && !/\blet (?:response|hasReviewableContent)\b/.test(awakeningHomeDeclarationSource)
      && !/\bonDrawScreenshot:/.test(awakeningHomeCallSource)
      && !/\bonDraw:/.test(awakeningHomeCallSource)
      && !/\bresponse:/.test(awakeningHomeCallSource)
      && !/\bhasReviewableContent:/.test(awakeningHomeCallSource)
      && !awakeningHomeSource.includes("V2MemoryPoolSelector")
      && !awakeningHomeSource.includes("连续召回"),
    "The stack and button must call one screenshot action; release home must not receive legacy session state, callbacks, or mode selectors."
  ),
  check(
    "awakening_home_zero_cards_is_real_empty_state",
    /if\s+screenshotCardCount\s*==\s*0\s*\{/.test(awakeningHomeContentSource)
      && /Text\("还没有可以唤醒的记忆"\)/.test(awakeningHomeContentSource)
      && /V2PrimaryActionButton\(title:\s*"添加内容",\s*action:\s*onAddContent\)/.test(awakeningHomeContentSource)
      && !awakeningHomeContentSource.includes("hasReviewableContent")
      && !awakeningHomeContentSource.includes("response?.hasActiveCard")
      && /isActive:\s*!isLoading\s*&&\s*screenshotCardCount\s*>\s*0/.test(awakeningHomeContentSource)
      && /screenshotCardCount\s*==\s*0\s*\?\s*\.disabled/.test(awakeningHomeContentSource)
      && /guard\s+screenshotCardCount\s*>\s*0\s+else\s*\{\s*return\s*\}/.test(screenshotDrawSource),
    "Zero screenshot cards must render the add-content empty state; fixture, chapter, and legacy flags must not expose a disabled recall shell."
  ),
  check(
    "home_recall_front_card_is_opaque",
    !memoryCardStackSource.includes("Image(\"RecallCardSurface\")")
      && memoryCardStackSource.includes(".fill(V2Color.surfaceCream)")
      && !memoryCardStackSource.includes(".fill(V2Color.surfaceCream.opacity"),
    "The home recall stack must use an opaque code-drawn foreground card so rear artwork cannot overlap its labels."
  ),
  check(
    "recall_ritual_uses_frozen_phase_contract",
    /case home[\s\S]*case summoning[\s\S]*case recall[\s\S]*case scratching[\s\S]*case revealed[\s\S]*case assessing[\s\S]*case repairing[\s\S]*case checkpoint[\s\S]*case stowing[\s\S]*case paused/.test(recallPhaseSource),
    "The recall ritual must keep the frozen ten-phase contract, including an explicit repairing phase."
  ),
  check(
    "assessment_repair_and_checkpoint_are_sequential",
    /phase\s*==\s*\.repairing\s*\{[\s\S]{0,180}\brepairingLanding\b/.test(source.screenshotAwakeningViews)
      && repairingLandingSource.length > 0
      && !/currentIndex\s*\+\s*1|"继续下一张"|Button\("先收好"/.test(repairingLandingSource)
      && /phase\s*=\s*\.repairing/.test(submitAssessmentSource)
      && !/phase\s*=\s*\.checkpoint/.test(submitAssessmentSource)
      && /(?:guard|if)[^\n]*phase\s*==\s*\.repairing[^\n]*[\s\S]{0,300}phase\s*=\s*\.checkpoint/.test(repairingLandingSource),
    "Assessment must render repair separately, hide next/stow actions there, and only then advance to checkpoint."
  ),
  check(
    "summon_hides_internal_pool_title",
    summonTransitionSource.length > 0 && !/\bsession\.pool\.title\b/.test(summonTransitionSource),
    "Summoning must use neutral recall copy and must not expose the internal memory-pool title."
  ),
  check(
    "recall_mascot_has_ten_states",
    /enum V2RecallMascotState[\s\S]*case idle[\s\S]*case reacting[\s\S]*case turning[\s\S]*case rummaging[\s\S]*case carrying[\s\S]*case watching[\s\S]*case acknowledging[\s\S]*case thinking[\s\S]*case sleeping[\s\S]*case farewell/.test(source.awakeningViews),
    "The single official IP1 mascot must be composed into ten semantic states."
  ),
  check(
    "recall_mascot_uses_ip1_without_mirroring",
    existsSync(iosMascotAssetPath)
      && existsSync(webMascotAssetPath)
      && readFileSync(iosMascotAssetPath).equals(readFileSync(webMascotAssetPath))
      && mascotViewSource.includes('Image("RecallMascotShell")')
      && !/RecalloMascot(?:Idle|Tilt|Thinking|Hop|Success)/.test(mascotViewSource)
      && !/\bmirrored\b|scaleEffect\(x:\s*-1/.test(mascotViewSource)
      && source.webDemo.includes('app-demo-assets/mascot-v06/IP1-1.svg')
      && !source.webDemo.includes('recallo-mascot-${asset}.png')
      && !/scaleX\(\s*-1|rotateY\(\s*180|matrix\(\s*-1/.test(source.webDemo),
    "iOS and Web must render byte-identical IP1-1.svg for every mascot state and must never mirror or switch to legacy pose PNGs."
  ),
  check(
    "scratch_reveal_uses_canvas_grid_threshold",
    source.screenshotAwakeningViews.includes("Canvas { context, size in")
      && scratchCanvasSource.includes("coverContext.blendMode = .destinationOut")
      && source.screenshotAwakeningViews.includes("brushDiameter: CGFloat = 26")
      && source.screenshotAwakeningViews.includes("coverage >= 0.45"),
    "Scratch reveal must use a 26pt destination-out Canvas and a 45 percent grid threshold."
  ),
  check(
    "scratch_paths_are_normalized_for_resize_and_restore",
    /normalizedPoint\(value\.location,\s*in:\s*geometry\.size\)/.test(scratchCanvasSource)
      && /renderedPoint\([^,]+,\s*in:\s*size\)/.test(scratchCanvasSource)
      && /point\.x\s*\/\s*size\.width/.test(scratchCanvasSource)
      && /point\.y\s*\/\s*size\.height/.test(scratchCanvasSource)
      && /point\.x\s*\*\s*size\.width/.test(scratchCanvasSource)
      && /point\.y\s*\*\s*size\.height/.test(scratchCanvasSource)
      && /\(0\.\.\.1\)\.contains\([^\n]*\.x\)/.test(source.screenshotAwakeningViews)
      && /\(0\.\.\.1\)\.contains\([^\n]*\.y\)/.test(source.screenshotAwakeningViews)
      && !/paths\[paths\.count\s*-\s*1\]\.append\(value\.location\)/.test(scratchCanvasSource),
    "Scratch strokes must be stored as 0...1 coordinates, rendered against the current Canvas size, and reject legacy absolute paths on restore."
  ),
  check(
    "checkpoint_and_persistence_are_explicit",
    source.screenshotAwakeningViews.includes('"继续下一张"')
      && source.screenshotAwakeningViews.includes('Button("先收好"')
      && source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.currentCardID")')
      && source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.scratchPaths")')
      && source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.assessedReviewCycles")'),
    "Checkpoint choice, scratch restoration, and idempotent assessment markers must persist."
  ),
  check(
    "assessment_idempotency_is_scoped_to_review_cycle",
    source.screenshotAwakeningViews.includes("currentReviewCycleKey")
      && source.screenshotAwakeningViews.includes('attemptId: "ios-capture-assessment-\\(currentReviewCycleKey)"')
      && source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.assessedReviewCycles")')
      && !source.screenshotAwakeningViews.includes('attemptId: "ios-capture-assessment-\\(currentCard.id)"'),
    "Assessment idempotency must be stable for retries but change when the card enters a later review cycle."
  ),
  check(
    "optional_capture_schedule_has_stable_cycle_key",
    source.screenshotMemoryModels.includes('?? "initial"')
      && source.screenshotAwakeningViews.includes("currentCard.reviewCycleKey(scheduleOverride: currentSchedule)")
      && !source.screenshotAwakeningViews.includes("currentCard.schedule.nextReviewAt"),
    "Optional capture schedules must compile safely and use a deterministic initial review-cycle key."
  ),
  check(
    "capture_assessment_prefers_server_mastery",
    /struct Mastery: Decodable, Equatable[\s\S]*before: String[\s\S]*after: String[\s\S]*successfulRecallCount: Int[\s\S]*reviewCount: Int/.test(source.apiClient)
      && source.screenshotMemoryModels.includes("if let serverMastery")
      && source.v2Root.includes("serverMastery: response.mastery")
      && source.screenshotAwakeningViews.includes("if let serverMastery = response.mastery"),
    "Assessment responses may omit mastery for old servers, but server-owned mastery must win when present."
  ),
  check(
    "capture_assessment_uses_server_canonical_value",
    source.screenshotMemoryModels.includes("func canonicalAssessment(fallback: V2MemoryAssessment)")
      && source.v2Root.includes("let canonicalAssessment = response.canonicalAssessment(fallback: assessment)")
      && source.v2Root.includes("screenshotCards[index].apply(\n                canonicalAssessment,")
      && source.screenshotAwakeningViews.includes("assessment = canonicalAssessment"),
    "A repeated attempt must apply the assessment returned by the server, not a conflicting retry value."
  ),
  check(
    "checkpoint_resume_is_scoped_to_input_review_cycle",
    source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.presentationReviewCycleKey")')
      && source.screenshotAwakeningViews.includes("persistedPresentationReviewCycleKey = currentReviewCycleKey")
      && source.screenshotAwakeningViews.includes("restoredCard.matchesPersistedPresentation(")
      && source.screenshotAwakeningViews.includes("resetPresentationForCurrentCycle()")
      && source.screenshotMemoryModels.includes("func matchesPersistedPresentation(")
      && source.apiClientTests.includes("testPresentationResumeRejectsDifferentReviewCycle"),
    "Persisted scratch and reveal state must be discarded when the card advances to a different review cycle."
  ),
  check(
    "fragments_are_saved_but_never_reviewed",
    /var isFormalReviewCard:\s*Bool[\s\S]{0,180}card\.state\s*==\s*\.formal[\s\S]{0,120}disposition\s*==\s*\.createCard/.test(capturedMemoryCardSource)
      && /guard\s+(?:captured|primaryCard)\.isReadyForReview\s+else/.test(screenshotAnalysisSource)
      && screenshotAnalysisSource.includes("selectedTab = .materials")
      && /case\s+\.archiveOnly:[\s\S]{0,100}libraryStatusText\("已保存碎片"\)/.test(libraryCardSource)
      && /case\s+\.needsConfirmation:[\s\S]{0,100}libraryStatusText\("待确认"\)/.test(libraryCardSource)
      && /if\s+captured\.isReadyForReview,\s*let schedule = captured\.schedule/.test(libraryCardSource),
    "Fragments and ungraded formal cards must remain visible in the library without mastery, scheduling, or draw eligibility."
  ),
  check(
    "capture_delete_waits_for_server_success",
    /func deleteCaptureMemoryCard\(id: String\)[\s\S]*?\/api\/memory-cards\/[\s\S]*?method: "DELETE"/.test(source.apiClient)
      && /let response = try await apiClient\.deleteCaptureMemoryCard\(id: id\)[\s\S]*?guard response\.deleted[\s\S]*?screenshotCards\.removeAll/.test(source.v2Root)
      && source.tabScreens.includes("删除这条记忆？")
      && source.tabScreens.includes("pendingMemoryCardDeletion"),
    "Knowledge-library deletion must be confirmed and local state may change only after a successful DELETE response."
  ),
  check(
    "account_deletion_clears_capture_state_before_refresh",
    /_ = try await apiClient\.deleteAccount\(\)[\s\S]*?clearCaptureMemoryStateAfterAccountDeletion\(\)[\s\S]*?await refreshBackendContentAfterAccountChange\(\)/.test(source.v2Root)
      && /clearCaptureMemoryStateAfterAccountDeletion\(\)[\s\S]*?screenshotAnalysisTask\?\.cancel\(\)[\s\S]*?screenshotCards\.removeAll\(\)[\s\S]*?screenshotDrawSession = nil[\s\S]*?V2ScreenshotPersistence\.clear\(\)/.test(source.v2Root)
      && source.screenshotMemoryModels.includes('"recallo.v06.scratchPaths"')
      && source.screenshotMemoryModels.includes('"recallo.v06.assessedReviewCycles"')
      && source.screenshotMemoryModels.includes('"recallo.v06.presentationReviewCycleKey"')
      && source.apiClientTests.includes("testAccountDeletionClearsPersistedScreenshotRecallState"),
    "A successful account deletion must erase in-memory and persisted capture state before any best-effort refresh."
  ),
  check(
    "ios_capture_contract_tests_cover_new_boundaries",
    source.apiClientTests.includes("testOptionalScheduleProducesStableInitialReviewCycleKey")
      && source.apiClientTests.includes("testServerMasteryOverridesLegacyClientProgression")
      && source.apiClientTests.includes("testFragmentsNeverEnterFormalReviewPools")
      && source.apiClientTests.includes("testDecodesCaptureMemoryCardDeletionContract")
      && source.apiClientTests.includes("canonicalAssessment(fallback: .forgot)")
      && source.apiClientTests.includes("testPresentationResumeRejectsDifferentReviewCycle")
      && source.apiClientTests.includes("testAccountDeletionClearsPersistedScreenshotRecallState")
      && source.apiClientTests.includes("XCTAssertNil(response.mastery)"),
    "Swift contract tests must retain optional schedule, server mastery, legacy response, fragment eligibility, and delete decoding coverage."
  ),
  check(
    "checkpoint_restores_assessment_mastery_and_schedule",
    source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.assessment")')
      && source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.masteryAfter")')
      && source.screenshotAwakeningViews.includes('@AppStorage("recallo.v06.scheduleNextReviewAt")')
      && source.screenshotAwakeningViews.includes("ImageFlowReviewSchedule("),
    "Checkpoint restoration must keep the submitted assessment, mastery transition, and returned schedule."
  ),
  check(
    "scratch_accessibility_and_coverage_share_cells",
    source.screenshotAwakeningViews.includes("adjustCoveredCells(by: 0.15)")
      && source.screenshotAwakeningViews.includes("brushDiameter / 2")
      && !source.screenshotAwakeningViews.includes("coverage = min(1, coverage + 0.15)"),
    "VoiceOver adjustment and finger scratching must share one cell-based coverage source without inflating the brush radius."
  ),
  check(
    "scratch_hidden_answer_is_not_accessible_before_reveal",
    !scratchCanvasSource.includes("Text(hiddenText)")
      && /Canvas \{ context, size in[\s\S]{0,520}Text\(verbatim:\s*hiddenText\)/.test(scratchCanvasSource)
      && /context\.draw\(\s*renderedAnswer,\s*in:\s*answerFrame\s*\)/.test(scratchCanvasSource)
      && revealedContentSource.includes("Text(currentCard.card.coreKnowledge)"),
    "The covered answer must be Canvas-rendered without a semantic Text node, while revealed content keeps its formal accessible Text."
  ),
  check(
    "fuzzy_feedback_uses_tilt_without_inactive_pause",
    /case \.fuzzy: return \.turning/.test(source.screenshotAwakeningViews)
      && /case \.inactive:\s+persistPresentationState\(\)/.test(source.screenshotAwakeningViews),
    "Fuzzy feedback should use the head tilt and transient inactive events should not replace the ritual with a paused screen."
  ),
  check(
    "summon_timings_cover_first_next_and_reduced_motion",
    summonTimingTotals?.first === 1_800_000_000
      && summonTimingTotals?.next === 900_000_000
      && /if\s+reduceMotion[\s\S]{0,240}Task\.sleep\(nanoseconds:\s*180_000_000\)[\s\S]{0,260}phase\s*=\s*\.recall/.test(summonTaskSource)
      && /Task\.sleep\(nanoseconds:\s*timings\[4\]\)[\s\S]{0,220}phase\s*=\s*\.recall/.test(summonTaskSource)
      && source.webDemo.includes("ui.lastSummonDuration = reduced.matches ? 180 : ui.summonCount === 0 ? 1800 : 900;"),
    "iOS and Web summoning must enter recall after exactly 1800ms for the first card, 900ms later, and 180ms with Reduce Motion."
  ),
  check(
    "web_capture_uses_stage_text_without_fake_percentages",
    source.webDemo.includes('data-testid="capture-progress"')
      && !source.webDemo.includes("progress-bar")
      && !source.webDemo.includes('stage === "queued" ? 20')
      && !source.webDemo.includes("uploadProgress"),
    "Capture processing may show a truthful stage label, but must not synthesize percentages or a determinate progress bar."
  ),
  check(
    "web_multi_card_group_keeps_singular_compatibility",
    source.webDemo.includes("analysis.memoryCards || result?.memoryCards || []")
      && source.webDemo.includes("analysis.memoryCard || result?.memoryCard || memoryCards[0]")
      && source.webDemo.includes("record?.memoryCard || record?.card || memoryCards?.[0] || record")
      && source.webDemo.includes("function normalizeRecords(records)")
      && source.webDemo.includes("card.captureGroup?.cardIds || []")
      && source.webDemo.includes("declared + 1")
      && source.webDemo.includes('data-testid="memory-group"')
      && source.webDemo.includes("每次只回忆一张"),
    "Web must accept capture memoryCards, rebuild restart groups from zero-based captureGroup.cardIds/index, preserve singular fallback, and show one card at a time."
  ),
  check(
    "web_source_context_preserves_frozen_contract",
    source.webDemo.includes('schemaVersion:String(value.schemaVersion || "")')
      && source.webDemo.includes('nearbyText:String(value.nearbyText || "")')
      && source.webDemo.includes('return {summary:value,highlights:[]}')
      && source.webDemo.includes('summary:String(value.summary || "")')
      && source.webDemo.includes("highlights:(Array.isArray(value.highlights)")
      && source.webDemo.includes('const legacyAliases = {complete:"full",nearby_only:"screenshot_only"}')
      && source.webDemo.includes('["full","partial","screenshot_only"].includes(normalized)')
      && source.webDemo.includes(".filter(Boolean).slice(0,64)")
      && source.webDemo.includes("type:String(value.type || \"\")")
      && source.webDemo.includes("sourceRole:String(value.sourceRole || \"\")")
      && source.webDemo.includes("startSeconds:value.startSeconds !== null")
      && source.webDemo.includes("endSeconds:value.endSeconds !== null")
      && source.webDemo.includes("formatContextTimestamp(block.startSeconds)")
      && source.webDemo.includes("overviewData.highlights.map")
      && source.webDemo.includes('data-testid="context-nearby-fallback"')
      && source.webDemo.includes('class="context-overview"'),
    "Web source context must normalize the frozen overview, completeness and timestamp contract, retain up to 64 typed blocks, render summary/highlights/timestamps, and fall back truthfully to nearbyText."
  ),
  check(
    "web_context_dialog_reveals_explicitly_and_returns_focus",
    source.webDemo.includes('aria-haspopup="dialog"')
      && source.webDemo.includes('role="dialog" aria-modal="true"')
      && source.webDemo.includes('class="context-marker">截图附近</span>')
      && source.webDemo.includes('reveal({openContext:true})')
      && source.webDemo.includes('event.key==="Escape"')
      && source.webDemo.includes('requestAnimationFrame(()=>app.querySelector(\'[data-testid="context-expand"]\')?.focus())'),
    "Source context must be an explicit reveal action with dialog semantics, screenshot-nearby markers, Escape close, and focus restoration."
  ),
  check(
    "web_hidden_semantic_is_not_dom_text_before_reveal",
    source.webDemo.includes('class="scratch-answer-canvas" aria-hidden="true"')
      && source.webDemo.includes("answerContext.fillText")
      && !source.webDemo.includes('<div class="scratch-answer">${escapeHtml(card.hiddenSemantic)}</div><canvas class="scratch"'),
    "Before explicit reveal, the hidden semantic may be painted under the scratch layer but must not appear as readable DOM text."
  ),
  check(
    "web_visibility_resume_stabilizes_transient_phases",
    source.webDemo.includes('const stableResumePhase = phase => ["summoning","stowing"].includes(phase) ? "recall" : phase;')
      && source.webDemo.includes("ui.resumePhase=stableResumePhase(ui.phase)")
      && source.webDemo.includes('ui.phase=stableResumePhase(ui.resumePhase)||"recall"')
      && source.webDemo.includes('ui.phase=stableResumePhase(ui.resumePhase||"recall")'),
    "Visibility resume must restore a stable phase (summoning/stowing -> recall) instead of a dead transient state; skip behavior stays unchanged."
  ),
  check(
    "web_group_backing_layers_match_group_size",
    source.webDemo.includes("Math.min(2,Math.max(0,count - 1))"),
    "Recall card backing layers must equal min(2, groupCount-1) so a 2-card group never looks like 3 cards."
  ),
  check(
    "web_context_timestamp_range_requires_end_after_start",
    source.webDemo.includes("block.endSeconds > block.startSeconds"),
    "Context timestamps may render a range only when endSeconds > startSeconds, matching the iOS guard."
  ),
  check(
    "ios_source_context_completeness_tolerates_legacy_and_unknown_values",
    source.apiClient.includes("init(normalizing rawValue: String?)")
      && source.apiClient.includes('case "full", "complete":')
      && source.apiClient.includes('case "screenshot_only", "nearby_only", .none:')
      && source.apiClient.includes("completeness = Completeness(")
      && !source.apiClient.includes("decodeIfPresent(Completeness.self, forKey: .completeness)"),
    "iOS completeness decoding must map legacy complete/nearby_only and fall back safely on unknown values instead of failing the card list."
  ),
  check(
    "ios_group_ui_renders_current_position",
    source.screenshotAwakeningViews.includes("当前 \\(currentCard.groupCardIndex + 1) / \\(currentCard.groupCardCount)")
      && source.screenshotAwakeningViews.includes("当前 \\(item.groupCardIndex + 1) / \\(item.groupCardCount)")
      && source.screenshotAwakeningViews.includes("groupCardIndex: currentCard.groupCardIndex"),
    "iOS group UI must render the current X / N position from the zero-based groupCardIndex, not the count alone."
  ),
  check(
    "ios_source_context_matches_web_labels_and_nearby_fallback",
    source.screenshotAwakeningViews.includes('case .full: "脉络较完整"')
      && source.screenshotAwakeningViews.includes('case .partial: "脉络不完整"')
      && source.screenshotAwakeningViews.includes('case .screenshotOnly: "仅截图附近"')
      && !source.screenshotAwakeningViews.includes('case .full: "全文脉络"')
      && source.screenshotAwakeningViews.includes("if visibleBlocks.isEmpty,"),
    "iOS completeness labels must match the Web wording and nearbyText may render standalone only when no typed blocks exist."
  ),
  check(
    "ios_delete_renormalizes_surviving_capture_group",
    source.screenshotMemoryModels.includes("func removingGroupMember(_ removedCardID: String) -> V2CapturedMemoryCard")
      && source.screenshotMemoryModels.includes("group.cardIds = remainingIDs.isEmpty ? [updatedCard.id] : remainingIDs")
      && source.v2Root.includes("screenshotCards = screenshotCards.map { $0.removingGroupMember(id) }"),
    "After a successful delete, surviving in-memory cards must re-normalize captureGroup count/index/cardIds so no session shows stale group metadata."
  ),
  check(
    "ios_duplicate_capture_merges_local_progression",
    source.screenshotMemoryModels.includes("func mergedWithLocalProgression(of existing: V2CapturedMemoryCard) -> V2CapturedMemoryCard")
      && source.screenshotMemoryModels.includes("schedule: schedule ?? existing.schedule")
      && source.v2Root.includes("capturedCard.mergedWithLocalProgression("),
    "A duplicate screenshot returning the same canonical id must merge payload fields with existing mastery, counts, capture time, schedule, and assessment."
  ),
  check(
    "rarity_has_no_default_r_fallback",
    !/rarity\?\.rawValue\s*\?\?\s*"R"/.test(rarityFallbackSource)
      && !/\brarity\s*\?\?\s*\.r\b/.test(rarityFallbackSource)
      && !/rarity\?\.rawValue\s*\?\?\s*"记忆卡"/.test(rarityFallbackSource),
    "Missing rarity must remain ungraded; presentation code must never silently coerce it to R or a generic review card."
  ),
  check(
    "rarity_is_required_for_review_and_feedback",
    /var isUngradedFormalCard:\s*Bool[\s\S]{0,160}isFormalReviewCard\s*&&\s*card\.rarity\s*==\s*nil/.test(capturedMemoryCardSource)
      && /var isReadyForReview:\s*Bool[\s\S]{0,160}isFormalReviewCard\s*&&\s*card\.rarity\s*!=\s*nil/.test(capturedMemoryCardSource)
      && /mutating func apply\([\s\S]{0,260}guard\s+isReadyForReview\s+else/.test(captureApplySource)
      && /func isEligible\([\s\S]{0,220}guard\s+isReadyForReview\s+else/.test(capturedMemoryCardSource)
      && /screenshotCards\.filter\(\\\.isReadyForReview\)/.test(reviewableScreenshotCardsSource)
      && /guard\s+(?:captured|primaryCard)\.isReadyForReview\s+else/.test(screenshotAnalysisSource)
      && /(?:captured|primaryCard)\.isUngradedFormalCard/.test(screenshotAnalysisSource)
      && screenshotAnalysisSource.includes("暂不进入复习")
      && /guard\s+currentCard\.isReadyForReview\s+else/.test(completeAssessmentSource)
      && /if\s+!currentCard\.isReadyForReview/.test(source.screenshotAwakeningViews),
    "Only formal cards with an explicit rarity may enter a draw, submit feedback, receive mastery, or obtain a schedule."
  ),
  check(
    "rarity_branches_live_in_shared_presentation",
    rarityPresentationSource.length > 0
      && /struct V2RarityVisualStyle\b/.test(rarityPresentationSource)
      && /struct V2RarityBadge:\s*View\b/.test(rarityPresentationSource)
      && /struct V2UngradedRarityBadge:\s*View\b/.test(rarityPresentationSource)
      && /struct V2RarityMaterialOverlay:\s*View\b/.test(rarityPresentationSource)
      && /struct V2RarityBadge:[\s\S]{0,180}let rarity:\s*ImageFlowMemoryCard\.Rarity\s*(?:\n|$)/.test(rarityPresentationSource)
      && /switch\s+rarity\s*\{[\s\S]*case \.r:[\s\S]*case \.sr:[\s\S]*case \.ssr:/.test(rarityPresentationSource)
      && !/case \.(?:r|sr|ssr):|switch[^\n]*rarity/.test(rarityBranchingOutsidePresentation)
      && !/private var rarityColor\b/.test(source.screenshotAwakeningViews)
      && source.screenshotAwakeningViews.includes("V2RarityBadge(")
      && source.screenshotAwakeningViews.includes("V2RarityMaterialOverlay(")
      && source.tabScreens.includes("V2RarityBadge(")
      && source.tabScreens.includes("V2UngradedRarityBadge("),
    "R, SR, and SSR may branch only inside the shared rarity presentation components, whose badge input is nonoptional."
  ),
  check(
    "rarity_reason_is_revealed_only",
    revealedContentSource.includes("rarityReason")
      && ![
        summonTransitionSource,
        formalCardSource,
        repairingLandingSource,
        archiveLandingSource,
        libraryCardSource,
        rarityPresentationSource
      ].join("\n").includes("rarityReason"),
    "Rarity reasons may be rendered only after the answer is revealed, never during summoning, recall, repair, checkpoint, or library browsing."
  ),
  check(
    "library_distinguishes_ungraded_from_mastery",
    libraryCardSource.includes("captured.isUngradedFormalCard")
      && libraryCardSource.includes("V2UngradedRarityBadge(")
      && rarityPresentationSource.includes('Text("待定级")')
      && /if\s+captured\.isReadyForReview\s*\{[\s\S]{0,240}captured\.masteryStage/.test(libraryCardSource)
      && /if\s+captured\.isReadyForReview,\s*let schedule = captured\.schedule/.test(libraryCardSource)
      && !/private var isFormalReviewCard\b/.test(libraryCardSource)
      && !/\?\?\s*"记忆卡"/.test(libraryCardSource),
    "The library must label missing rarity as ungraded and hide mastery and schedule until the card is ready for review."
  ),
  check(
    "rarity_does_not_affect_selection_or_feedback",
    drawSessionSource.length > 0
      && captureApplySource.length > 0
      && rootAssessmentSource.length > 0
      && submitAssessmentSource.length > 0
      && !/\brarity\b/i.test(drawSessionSource)
      && !/\brarity\b/i.test(captureApplySource)
      && !/\brarity\b/i.test(rootAssessmentSource)
      && !/\brarity\b/i.test(submitAssessmentSource),
    "Rarity may style the reveal, but must not participate in draw ordering, assessment feedback, mastery, or schedule updates."
  ),
  check(
    "awakening_source_is_feedback_only",
    /if let feedback = response\.feedback \{[\s\S]*V2AnswerFeedbackPanel\([\s\S]*onSource:\s*onSource/.test(source.awakeningViews)
      && !/awakeningQuestionCard[\s\S]*Button\(action:\s*onSource\)/.test(source.awakeningViews),
    "The source entry must appear with answer feedback, not leak evidence before recall."
  ),
  check(
    "awakening_answer_is_server_backed",
    /answerV2AwakeningSession\([\s\S]*selectedOptionId:[\s\S]*attemptId:/.test(source.apiClient)
      && /api\/v2\/awakening-sessions\/.*\/answer/.test(source.apiClient)
      && /apiClient\.answerV2AwakeningSession\(/.test(source.v2Root),
    "Awakening answers must use the server-owned idempotent session endpoint."
  ),
  check(
    "awakening_failed_answer_can_retry",
    /\.onChange\(of:\s*isSubmitting\)[\s\S]*response\.feedback == nil[\s\S]*selectedOptionId = nil/.test(source.awakeningViews),
    "A failed answer submission must unlock the local option state for retry."
  ),
  check(
    "awakening_fixture_keeps_session_identity",
    /answeredResponse\([\s\S]*from current:[\s\S]*sessionId:\s*current\?\.awakeningSession\?\.id/.test(source.awakeningModels),
    "Fixture feedback must retain the current card session identity."
  )
];

console.log("# V2 UI Regression Guard");
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name} - ${item.detail}`);
}

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error("");
  console.error(`V2 UI regression guard failed: ${failed.map((item) => item.name).join(", ")}`);
  process.exit(1);
}

function check(name, ok, detail) {
  return { name, ok: Boolean(ok), detail };
}

function extractBetween(fileSource, startMarker, endMarker) {
  const start = fileSource.indexOf(startMarker);
  const end = fileSource.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) return "";
  return fileSource.slice(start, end);
}

function countOccurrences(fileSource, needle) {
  if (!needle) return 0;
  return fileSource.split(needle).length - 1;
}

function extractSummonTimingTotals(fileSource) {
  const match = /let timings:\s*\[UInt64\]\s*=\s*currentIndex\s*==\s*0\s*\?\s*\[([^\]]+)\]\s*:\s*\[([^\]]+)\]/m.exec(fileSource);
  if (!match) return null;
  const first = sumNanoseconds(match[1]);
  const next = sumNanoseconds(match[2]);
  if (first == null || next == null) return null;
  return { first, next };
}

function sumNanoseconds(rawValues) {
  const values = rawValues
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0 || !values.every((value) => /^\d[\d_]*$/.test(value))) {
    return null;
  }
  return values.reduce(
    (total, value) => total + Number(value.replaceAll("_", "")),
    0
  );
}

function extractMatchingCardSource(fileSource) {
  const start = fileSource.indexOf("struct V2MatchingOptionCard");
  const end = fileSource.indexOf("struct V2AnswerFeedbackPanel");
  if (start < 0 || end < 0 || end <= start) return fileSource;
  return fileSource.slice(start, end);
}

function extractMatchingCardPrivateMetrics(fileSource) {
  const matchingCard = extractMatchingCardSource(fileSource);
  return /private enum Metrics \{([\s\S]*?)\n    \}/.exec(matchingCard)?.[1] || "";
}

function extractMatchingScreenSource(fileSource) {
  const start = fileSource.indexOf("struct V2MatchingQuestionView");
  const end = fileSource.indexOf("private enum V2QuestionFeedbackMetrics");
  if (start < 0 || end < 0 || end <= start) return fileSource;
  return fileSource.slice(start, end);
}
