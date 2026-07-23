#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const files = {
  questionComponents: resolve(repoRoot, "拾贝/拾贝/V2/Components/Flow/V2QuestionComponents.swift"),
  reviewFlowScreens: resolve(repoRoot, "拾贝/拾贝/V2/Screens/Review/V2ReviewFlowScreens.swift"),
  awakeningViews: resolve(repoRoot, "拾贝/拾贝/V2/Screens/Home/V2AwakeningViews.swift"),
  awakeningModels: resolve(repoRoot, "拾贝/拾贝/V2/Models/V2AwakeningModels.swift"),
  v2Root: resolve(repoRoot, "拾贝/拾贝/V2/V2RootView.swift"),
  apiClient: resolve(repoRoot, "拾贝/拾贝/Services/APIClient.swift")
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")])
);
const matchingCardSource = extractMatchingCardSource(source.questionComponents);
const matchingScreenSource = extractMatchingScreenSource(source.reviewFlowScreens);

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
    "awakening_home_is_single_card_and_low_pressure",
    source.awakeningViews.includes("今天，唤醒一点记忆")
      && source.awakeningViews.includes('return response?.hasActiveCard == true ? "继续这张" : "抽一张"')
      && source.awakeningViews.includes("一张就好，随时可以停下"),
    "Awakening home must present one resumable card without streak, rank, or social pressure."
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
