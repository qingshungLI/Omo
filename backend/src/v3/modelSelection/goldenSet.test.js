import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadGoldenSet, validateGoldenSet } from "./goldenSet.js";
import { validSyntheticSample } from "./testFixtures.js";

test("synthetic smoke manifest is valid for development but never selection", async () => {
  const manifestPath = fileURLToPath(new URL(
    "../../../../quality-test-set/v3-capture-analysis/manifest.synthetic-smoke.json",
    import.meta.url
  ));
  const dataset = await loadGoldenSet(manifestPath);
  assert.equal(dataset.validation.validForDevelopment, true);
  assert.equal(dataset.validation.readyForSelection, false);
  assert.equal(dataset.validation.stats.sampleCount, 2);
});

test("missing deidentification fails development validation", async () => {
  const validation = await validateGoldenSet({
    schemaVersion: "v3_capture_golden_v1",
    datasetId: "test",
    samples: [validSyntheticSample({ deidentified: false })]
  });
  assert.equal(validation.validForDevelopment, false);
  assert.equal(
    validation.issues.some((issue) => issue.code === "golden_deidentified"),
    true
  );
});
