#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) {
  throw new Error(
    "Usage: build-cached-ui-fixture.mjs <private-snapshot-v2.json> " +
      "<cached-ui-memory-cards-v2.json>",
  );
}

const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
const source = JSON.parse(await readFile(inputPath, "utf8"));

if (source.schemaVersion !== "real_capture_ui_snapshot_2") {
  throw new Error(`Unsupported private source schema: ${source.schemaVersion}`);
}
if (!Array.isArray(source.appReplayFixtures)) {
  throw new Error("Private source is missing appReplayFixtures");
}

let cachedCardIndex = 0;

function copyDefined(sourceObject, targetObject, keys) {
  for (const key of keys) {
    if (sourceObject[key] !== undefined) {
      targetObject[key] = sourceObject[key];
    }
  }
}

function sanitizeCard(card, namespace) {
  cachedCardIndex += 1;
  const id = `${namespace}-${String(cachedCardIndex).padStart(2, "0")}`;
  const evidenceIDs = [
    ...(card.sourceEvidenceIds ?? []),
    ...(card.recallVariants ?? []).flatMap(
      (variant) => variant.sourceEvidenceIds ?? [],
    ),
  ];
  const evidenceMap = new Map();
  for (const originalID of evidenceIDs) {
    if (!evidenceMap.has(originalID)) {
      evidenceMap.set(
        originalID,
        `${id}-evidence-${String(evidenceMap.size + 1).padStart(2, "0")}`,
      );
    }
  }

  const sanitized = {
    id,
    state: card.state,
    coreKnowledge: card.coreKnowledge,
    recallCue: card.recallCue,
    explanation: card.explanation,
    sourceStatus: card.sourceStatus,
    disposition: card.disposition,
  };
  copyDefined(card, sanitized, [
    "hiddenSemantic",
    "rarity",
    "rarityReason",
    "rarityConfidence",
    "rarityRuleVersion",
    "masteryStage",
    "successfulRecallCount",
    "reviewCount",
    "lastAssessment",
  ]);

  if (evidenceMap.size > 0) {
    sanitized.sourceEvidenceIds = (card.sourceEvidenceIds ?? []).map(
      (originalID) => evidenceMap.get(originalID),
    );
  }

  if (Array.isArray(card.recallVariants)) {
    sanitized.recallVariants = card.recallVariants.map(
      (variant, variantIndex) => {
        const variantID =
          `${id}-variant-${String(variantIndex + 1).padStart(2, "0")}`;
        const options = (variant.options ?? []).map((option, optionIndex) => ({
          id:
            `${variantID}-option-` +
            String(optionIndex + 1).padStart(2, "0"),
          text: option.text,
        }));
        const correctOptionIndex = (variant.options ?? []).findIndex(
          (option) => option.id === variant.correctOptionId,
        );
        const sanitizedVariant = {
          id: variantID,
          type: variant.type,
          prompt: variant.prompt,
          options,
          explanation: variant.explanation,
          sourceEvidenceIds: (variant.sourceEvidenceIds ?? []).map(
            (originalID) => evidenceMap.get(originalID),
          ),
        };
        copyDefined(variant, sanitizedVariant, ["answer", "correctBoolean"]);
        if (correctOptionIndex >= 0) {
          sanitizedVariant.correctOptionId = options[correctOptionIndex].id;
        }
        return sanitizedVariant;
      },
    );
  }

  if (card.schedule) {
    sanitized.schedule = {
      cardId: id,
      nextReviewAt: "2000-01-01T00:00:00.000Z",
      intervalDays: card.schedule.intervalDays,
      state: card.schedule.state,
    };
    copyDefined(card.schedule, sanitized.schedule, ["status", "stepIndex"]);
  }

  return sanitized;
}

const anonymousCachedUIResponses = source.appReplayFixtures.map((fixture) => ({
  cards: (fixture.response?.cards ?? []).map((card) =>
    sanitizeCard(card, "cached-card"),
  ),
}));

const output = {
  schemaVersion: "cached_ui_memory_cards_2",
  anonymousCachedUIResponses,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, {
  mode: 0o644,
});
