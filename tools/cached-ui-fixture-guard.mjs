#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const fixturePath = resolve(
  repositoryRoot,
  process.argv[2] ??
    "Omo/Omo/V2/Fixtures/cached-ui-memory-cards-v2.json",
);
const payload = JSON.parse(await readFile(fixturePath, "utf8"));
const failures = [];

const allowedRootKeys = new Set([
  "schemaVersion",
  "fixtureKind",
  "anonymousCachedUIResponses",
]);
const forbiddenKeys = new Set([
  "appReplayFixtures",
  "canonicalRuns",
  "provenance",
  "backendFreeze",
  "callBudget",
  "generatedAt",
  "sourceKey",
  "sourceImage",
  "endpoint",
  "input",
  "expected",
  "initialOutcome",
  "finalOutcome",
  "expectationMatched",
  "validation",
  "captureId",
  "captureGroup",
  "captureGroupIndex",
  "sourceUrl",
  "sourceTitle",
  "sourceContext",
  "createdAt",
  "updatedAt",
  "capturedAt",
  "durationMs",
  "errorCode",
  "failureType",
]);
const forbiddenStringPatterns = [
  /\/data\d*\//i,
  /\/Users\//,
  /\bimage\d+\.(?:jpg|jpeg|png)\b/i,
  /\b[a-f0-9]{64}\b/i,
  /https?:\/\//i,
];

if (payload.schemaVersion !== "cached_ui_memory_cards_2") {
  failures.push(`unexpected schemaVersion: ${payload.schemaVersion}`);
}
if (payload.fixtureKind !== "synthetic_ui_showcase") {
  failures.push(`unexpected fixtureKind: ${payload.fixtureKind}`);
}
for (const key of Object.keys(payload)) {
  if (!allowedRootKeys.has(key)) {
    failures.push(`unexpected root key: ${key}`);
  }
}

function inspect(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspect(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        failures.push(`${path}.${key}: forbidden traceability key`);
      }
      inspect(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    for (const pattern of forbiddenStringPatterns) {
      if (pattern.test(value)) {
        failures.push(`${path}: forbidden traceability pattern ${pattern}`);
      }
    }
  }
}

inspect(payload);

const responses = payload.anonymousCachedUIResponses;
if (!Array.isArray(responses) || responses.length !== 6) {
  failures.push("anonymousCachedUIResponses must contain exactly 6 responses");
} else {
  for (const [index, response] of responses.entries()) {
    if (
      Object.keys(response).length !== 1 ||
      !Array.isArray(response.cards) ||
      response.cards.length !== 1
    ) {
      failures.push(
        `anonymousCachedUIResponses[${index}] must contain only one cards array`,
      );
    }
  }
}

const cachedCards = (responses ?? []).flatMap((response) => response.cards ?? []);
const cachedIDs = cachedCards.map((card) => card.id);
if (
  cachedIDs.some((id) => !/^cached-card-\d{2}$/.test(id)) ||
  new Set(cachedIDs).size !== cachedIDs.length
) {
  failures.push("cached card ids must be unique anonymous cached-card-NN ids");
}

const expectedDispositions = new Set([
  "create_card",
  "archive_only",
  "needs_confirmation",
]);
const dispositions = new Set(cachedCards.map((card) => card.disposition));
for (const disposition of expectedDispositions) {
  if (!dispositions.has(disposition)) {
    failures.push(`missing showcase disposition: ${disposition}`);
  }
}

const expectedRarities = new Set(["R", "SR", "SSR"]);
const rarities = new Set(
  cachedCards
    .filter((card) => card.disposition === "create_card")
    .map((card) => card.rarity),
);
for (const rarity of expectedRarities) {
  if (!rarities.has(rarity)) {
    failures.push(`missing synthetic showcase rarity: ${rarity}`);
  }
}

if (
  cachedCards.some(
    (card) =>
      !String(card.coreKnowledge ?? "").includes("合成") ||
      !String(card.explanation ?? "").includes("合成"),
  )
) {
  failures.push("every cached card must be explicitly marked as synthetic");
}

if (failures.length > 0) {
  console.error("Cached UI fixture guard failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Cached UI fixture guard passed: ${cachedCards.length} anonymous cached cards.`,
);
