import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const snapshotPath = new URL(
  "../拾贝/拾贝/V2/Fixtures/real-capture-ui-snapshot-v1.json",
  import.meta.url
);
const manifestPath = new URL(
  "../拾贝/拾贝/V2/Fixtures/real-capture-ui-snapshot-v1.manifest.json",
  import.meta.url
);
const loaderPath = new URL(
  "../拾贝/拾贝/V2/Fixtures/V2RealCaptureFixtureLoader.swift",
  import.meta.url
);

const snapshotText = await readFile(snapshotPath, "utf8");
const manifestText = await readFile(manifestPath, "utf8");
const loaderText = await readFile(loaderPath, "utf8");
const snapshot = JSON.parse(snapshotText);
const manifest = JSON.parse(manifestText);

assert.equal(snapshot.schemaVersion, "real_capture_ui_snapshot_1");
assert.equal(snapshot.canonicalCaptures.length, 3);
assert.equal(snapshot.uiPresentationFixtures.length, 3);
assert.deepEqual(
  new Set(snapshot.canonicalCaptures.map(
    (capture) => capture.canonicalResponse.cards[0]?.disposition
  )),
  new Set(["archive_only", "needs_confirmation"])
);
assert.deepEqual(
  new Set(snapshot.uiPresentationFixtures.map((record) => record.rarity)),
  new Set(["R", "SR", "SSR"])
);

for (const record of snapshot.uiPresentationFixtures) {
  assert.equal(record.state, "formal");
  assert.equal(record.disposition, "create_card");
  assert.equal(record.schedule.intervalDays, 0);
  assert.equal(record.schedule.state, "due");
  assert.ok(record.coreKnowledge.includes(record.hiddenSemantic));
  assert.ok(!record.coreKnowledge.includes("&#"));
  assert.ok(record.captureGroup == null);
  assert.ok(record.id.startsWith("ui-real-"));
  assert.equal(record.schedule.cardId, record.id);
}

assert.equal(manifest.privacy.includesImageBytes, false);
assert.equal(manifest.privacy.includesImageBase64, false);
assert.equal(manifest.privacy.includesCompleteModelResponses, false);
assert.equal(manifest.privacy.includesApiKeys, false);
assert.equal(manifest.entries.length, 3);
assert.ok(manifest.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.inputImageSha256)));

const forbidden = [
  /"imageBase64"\s*:/i,
  /sk-[A-Za-z0-9._-]{12,}/,
  /oqoSAdIL/,
  /QWEN_API_KEY/,
  /TIKHUB_API_KEY/
];
for (const pattern of forbidden) {
  assert.equal(pattern.test(snapshotText), false, `snapshot contains ${pattern}`);
  assert.equal(pattern.test(manifestText), false, `manifest contains ${pattern}`);
}

assert.match(loaderText, /^#if DEBUG/m);
assert.match(loaderText, /canonicalCaptures/);
assert.match(loaderText, /uiPresentationFixtures/);

console.log("real capture UI fixture guard: PASS (3 canonical + 3 DEBUG presentation cards)");
