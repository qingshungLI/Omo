#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const backendRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = join(backendRoot, "src/v3/modelSelection");
const jsFiles = await collectJsFiles(sourceRoot);
const testFiles = jsFiles.filter((filePath) => filePath.endsWith(".test.js"));

for (const filePath of jsFiles) {
  runNode(["--check", relative(backendRoot, filePath)]);
}
for (const scriptName of [
  "validate-v3-golden-set.mjs",
  "run-v3-model-selection.mjs",
  "finalize-v3-model-selection.mjs"
]) {
  runNode(["--check", `scripts/${scriptName}`]);
}
if (testFiles.length) {
  runNode(["--test", ...testFiles.map((filePath) => relative(backendRoot, filePath))]);
}

async function collectJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: backendRoot, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
