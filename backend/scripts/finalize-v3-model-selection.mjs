#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  parseManualReviewCsv,
  renderModelSelectionReport
} from "../src/v3/modelSelection/report.js";
import {
  applyManualReviews,
  selectModelPortfolio
} from "../src/v3/modelSelection/selection.js";

const args = parseArgs(process.argv.slice(2));
if (!args.result || !args.manualReview || !args.output) {
  throw new Error(
    "Usage: --result <result.json> --manual-review <review.csv> --output <report.md>"
  );
}

const rawResult = await readJson(args.result);
const textReviews = parseManualReviewCsv(await readFile(resolve(args.manualReview), "utf8"));
const result = applyManualReviews(rawResult, textReviews);
const decision = selectModelPortfolio({
  result,
  datasetReady: Boolean(result.selectionReadyDataset)
});
const report = renderModelSelectionReport({
  decision,
  result
});
const outputPath = resolve(args.output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, report);
await writeFile(
  outputPath.replace(/\.(md|markdown)$/i, ".json"),
  JSON.stringify(decision, null, 2)
);
console.log(`Wrote ${outputPath}`);
console.log(`Decision: ${decision.status.toUpperCase()} (${decision.reason})`);

async function readJson(filePath) {
  return JSON.parse(await readFile(resolve(filePath), "utf8"));
}

function parseArgs(values) {
  const output = {};
  const mapping = {
    "--result": "result",
    "--manual-review": "manualReview",
    "--output": "output"
  };
  for (let index = 0; index < values.length; index += 1) {
    const key = mapping[values[index]];
    if (!key) throw new Error(`未知参数：${values[index]}`);
    output[key] = values[++index];
  }
  return output;
}
