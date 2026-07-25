#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const catalogRoot = resolve(
  repositoryRoot,
  process.argv[2] ?? "Omo/Omo/Assets.xcassets",
);

const failures = [];
let contentsCount = 0;
let referencedFileCount = 0;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (entry.isFile() && entry.name === "Contents.json") {
      await validateContents(path);
    }
  }
}

function referencedFilenames(payload) {
  const filenames = [];
  const collect = (records) => {
    if (!Array.isArray(records)) {
      return;
    }
    for (const record of records) {
      if (typeof record?.filename === "string" && record.filename.length > 0) {
        filenames.push(record.filename);
      }
    }
  };
  collect(payload.images);
  collect(payload.data);
  return filenames;
}

async function validateContents(contentsPath) {
  contentsCount += 1;
  const relativeContentsPath = relative(repositoryRoot, contentsPath);
  let payload;
  try {
    payload = JSON.parse(await readFile(contentsPath, "utf8"));
  } catch (error) {
    failures.push(`${relativeContentsPath}: invalid JSON (${error.message})`);
    return;
  }

  const directory = dirname(contentsPath);
  const references = referencedFilenames(payload);
  const uniqueReferences = new Set(references);

  for (const filename of uniqueReferences) {
    referencedFileCount += 1;
    if (
      filename !== basename(filename) ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes(sep)
    ) {
      failures.push(`${relativeContentsPath}: unsafe filename ${filename}`);
      continue;
    }
    const filePath = join(directory, filename);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile() || fileStat.size === 0) {
        failures.push(`${relativeContentsPath}: empty or non-file ${filename}`);
      }
    } catch {
      failures.push(`${relativeContentsPath}: missing ${filename}`);
    }
  }

  if (!directory.endsWith(".imageset") && !directory.endsWith(".dataset")) {
    return;
  }

  const actualPayloadFiles = (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== "Contents.json" &&
        entry.name !== ".DS_Store",
    )
    .map((entry) => entry.name);
  for (const filename of actualPayloadFiles) {
    if (!uniqueReferences.has(filename)) {
      failures.push(`${relativeContentsPath}: unreferenced payload ${filename}`);
    }
  }
}

try {
  await walk(catalogRoot);
} catch (error) {
  failures.push(
    `${relative(repositoryRoot, catalogRoot)}: cannot scan (${error.message})`,
  );
}

if (failures.length > 0) {
  console.error("Asset catalog guard failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Asset catalog guard passed: ${contentsCount} Contents.json files, ` +
    `${referencedFileCount} referenced payloads.`,
);
