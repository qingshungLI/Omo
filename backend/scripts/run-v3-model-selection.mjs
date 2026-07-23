#!/usr/bin/env node
import "../src/env.js";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  checkCandidateAvailability,
  DEFAULT_PRIMARY_VISION_CANDIDATE_ID,
  resolveModelCandidate
} from "../src/v3/modelSelection/candidates.js";
import { loadGoldenSet } from "../src/v3/modelSelection/goldenSet.js";
import { runModelSelectionBenchmark } from "../src/v3/modelSelection/benchmark.js";
import { createManualReviewCsv } from "../src/v3/modelSelection/report.js";

const args = parseArgs(process.argv.slice(2));
const configPath = resolve(
  args.config || "../quality-test-set/v3-capture-analysis/benchmark.config.example.json"
);
const config = JSON.parse(await readFile(configPath, "utf8"));
const manifestPath = resolve(dirname(configPath), args.manifest || config.manifest);
const phase = args.phase || "vision";
const candidateKey = phase === "vision" ? "visionCandidateIds" : "textCandidateIds";
const candidateIds = [
  ...(config[candidateKey] || []),
  ...(args.control && phase === "vision" ? (config.controlCandidateIds || []) : [])
];
const candidates = candidateIds.map(resolveModelCandidate);
const preferredPrimaryCandidateId = phase === "vision"
  ? (config.preferredPrimaryCandidateId || DEFAULT_PRIMARY_VISION_CANDIDATE_ID)
  : null;
if (
  preferredPrimaryCandidateId
  && !candidateIds.includes(preferredPrimaryCandidateId)
) {
  throw new Error(`首选主模型不在本轮候选中：${preferredPrimaryCandidateId}`);
}
const dataset = await loadGoldenSet(manifestPath, { requireImages: phase === "vision" });
const availability = candidates.map((candidate) => checkCandidateAvailability(candidate));
const preflight = {
  configPath,
  manifestPath,
  phase,
  execute: Boolean(args.execute),
  preferredPrimaryCandidateId,
  selectionReadyDataset: dataset.validation.readyForSelection,
  datasetStats: dataset.validation.stats,
  candidates: availability
};
console.log(JSON.stringify(preflight, null, 2));

if (!args.execute) {
  console.log("Preflight only. Add --execute to make paid model calls.");
  process.exit(0);
}
if (!dataset.validation.readyForSelection && !args.allowDevelopmentSet) {
  throw new Error("Golden Set 未达到正式选型要求；开发集运行需显式加入 --allow-development-set。");
}
const unavailable = availability.filter((item) => !item.available);
if (unavailable.length) {
  throw new Error(`以下候选缺少 Key：${unavailable.map((item) => item.candidateId).join(", ")}`);
}

const result = await runModelSelectionBenchmark({
  dataset,
  candidates,
  phase,
  preferredPrimaryCandidateId,
  usdToCny: Number(config.usdToCny) || 7.2,
  onRecord(record) {
    console.log(`${record.candidateId} / ${record.sampleId}: ${record.status}`);
  }
});
const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
const outputPath = resolve(
  args.output || `../quality-test-set/results/v3-model-selection/${phase}-${timestamp}.json`
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2));
await writeFile(outputPath.replace(/\.json$/i, ".manual-review.csv"), createManualReviewCsv(result));
console.log(`Wrote ${outputPath}`);

function parseArgs(values) {
  const output = {};
  const booleanFlags = new Map([
    ["--execute", "execute"],
    ["--allow-development-set", "allowDevelopmentSet"],
    ["--control", "control"]
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (booleanFlags.has(value)) output[booleanFlags.get(value)] = true;
    else if (value === "--config") output.config = values[++index];
    else if (value === "--manifest") output.manifest = values[++index];
    else if (value === "--phase") output.phase = values[++index];
    else if (value === "--output") output.output = values[++index];
    else throw new Error(`未知参数：${value}`);
  }
  if (output.phase && !["text", "vision"].includes(output.phase)) {
    throw new Error("--phase 只能是 text 或 vision。");
  }
  return output;
}
