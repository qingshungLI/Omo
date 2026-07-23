#!/usr/bin/env node
import { resolve } from "node:path";
import { loadGoldenSet } from "../src/v3/modelSelection/goldenSet.js";

const args = parseArgs(process.argv.slice(2));
const manifestPath = resolve(
  args.manifest || "../quality-test-set/v3-capture-analysis/manifest.template.json"
);
const dataset = await loadGoldenSet(manifestPath, { requireImages: Boolean(args.images) });
console.log(JSON.stringify({
  datasetId: dataset.datasetId,
  manifestPath: dataset.manifestPath,
  ...dataset.validation
}, null, 2));

if (args.selection && !dataset.validation.readyForSelection) process.exit(2);
if (!dataset.validation.validForDevelopment) process.exit(1);

function parseArgs(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--selection") output.selection = true;
    else if (value === "--images") output.images = true;
    else if (value === "--manifest") output.manifest = values[++index];
    else throw new Error(`未知参数：${value}`);
  }
  return output;
}
