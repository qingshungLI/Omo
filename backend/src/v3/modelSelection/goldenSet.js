import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CAPTURE_GOLDEN_SCHEMA_VERSION,
  validateCaptureAnalysisInput
} from "./contracts.js";

export const GOLDEN_SET_COHORTS = Object.freeze([
  "xiaohongshu",
  "wechat",
  "douyin",
  "web_feed",
  "hard_cases"
]);

export async function loadGoldenSet(manifestPath, { requireImages = false } = {}) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const raw = await readFile(absoluteManifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const rootDir = path.dirname(absoluteManifestPath);
  const samples = [];

  for (const entry of Array.isArray(manifest.samples) ? manifest.samples : []) {
    const samplePath = typeof entry === "string" ? path.resolve(rootDir, entry) : null;
    const sample = samplePath
      ? JSON.parse(await readFile(samplePath, "utf8"))
      : entry;
    samples.push(resolveSamplePaths(sample, samplePath ? path.dirname(samplePath) : rootDir));
  }

  const loaded = {
    schemaVersion: manifest.schemaVersion,
    datasetId: manifest.datasetId,
    description: manifest.description || "",
    samples,
    manifestPath: absoluteManifestPath
  };
  const validation = await validateGoldenSet(loaded, { requireImages });
  return { ...loaded, validation };
}

export async function validateGoldenSet(dataset, { requireImages = false } = {}) {
  const issues = [];
  if (dataset?.schemaVersion !== CAPTURE_GOLDEN_SCHEMA_VERSION) {
    issues.push(issue("golden_schema_version", "$.schemaVersion", "Golden Set schemaVersion 不正确。"));
  }
  if (typeof dataset?.datasetId !== "string" || !dataset.datasetId.trim()) {
    issues.push(issue("golden_dataset_id", "$.datasetId", "datasetId 必须是非空字符串。"));
  }
  if (!Array.isArray(dataset?.samples)) {
    return readiness(issues.concat(
      issue("golden_samples", "$.samples", "samples 必须是数组。")
    ), []);
  }

  const sampleIds = new Set();
  const cohortCounts = Object.fromEntries(GOLDEN_SET_COHORTS.map((cohort) => [cohort, 0]));
  let independentReviewCount = 0;
  let realEligibleCount = 0;

  for (const [index, sample] of dataset.samples.entries()) {
    const basePath = `$.samples[${index}]`;
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      issues.push(issue("golden_sample_type", basePath, "样本必须是对象。"));
      continue;
    }
    if (sample.schemaVersion !== CAPTURE_GOLDEN_SCHEMA_VERSION) {
      issues.push(issue("golden_sample_schema", `${basePath}.schemaVersion`, "样本 schemaVersion 不正确。"));
    }
    if (typeof sample.sampleId !== "string" || !sample.sampleId.trim()) {
      issues.push(issue("golden_sample_id", `${basePath}.sampleId`, "sampleId 必须是非空字符串。"));
    } else if (sampleIds.has(sample.sampleId)) {
      issues.push(issue("golden_duplicate_sample_id", `${basePath}.sampleId`, "sampleId 必须唯一。"));
    } else {
      sampleIds.add(sample.sampleId);
    }

    if (!GOLDEN_SET_COHORTS.includes(sample.cohort)) {
      issues.push(issue("golden_cohort", `${basePath}.cohort`, "cohort 不在允许范围内。"));
    } else {
      cohortCounts[sample.cohort] += 1;
    }
    if (typeof sample.platform !== "string" || !sample.platform.trim()) {
      issues.push(issue("golden_platform", `${basePath}.platform`, "platform 必须是非空字符串。"));
    }
    if (!["normal", "hard"].includes(sample.difficulty)) {
      issues.push(issue("golden_difficulty", `${basePath}.difficulty`, "difficulty 必须为 normal 或 hard。"));
    }
    if (!Array.isArray(sample.tags)) {
      issues.push(issue("golden_tags", `${basePath}.tags`, "tags 必须是数组。"));
    }
    if (sample.authorized !== true) {
      issues.push(issue("golden_authorization", `${basePath}.authorized`, "真实样本必须记录授权。"));
    }
    if (sample.deidentified !== true) {
      issues.push(issue("golden_deidentified", `${basePath}.deidentified`, "样本必须完成脱敏。"));
    }
    if (sample.synthetic !== true && sample.authorized === true && sample.deidentified === true) {
      realEligibleCount += 1;
    }

    for (const inputIssue of validateCaptureAnalysisInput(sample.input)) {
      issues.push(issue(inputIssue.code, `${basePath}.input${inputIssue.path.slice(1)}`, inputIssue.message));
    }
    validateAnnotation(sample.annotation, `${basePath}.annotation`, issues);
    if (Number(sample.annotation?.reviewerCount) >= 2) independentReviewCount += 1;

    if (sample.imagePath) {
      try {
        await access(sample.imagePath);
      } catch {
        issues.push(issue("golden_image_missing", `${basePath}.imagePath`, "截图文件不存在。"));
      }
    } else if (requireImages) {
      issues.push(issue("golden_image_required", `${basePath}.imagePath`, "本次运行要求每个样本都提供图片。"));
    }
  }

  const selectionIssues = [...issues];
  if (dataset.samples.length !== 60) {
    selectionIssues.push(issue(
      "selection_sample_count",
      "$.samples",
      `正式选型需要恰好 60 张真实截图，当前为 ${dataset.samples.length} 张。`
    ));
  }
  for (const cohort of GOLDEN_SET_COHORTS) {
    if (cohortCounts[cohort] !== 12) {
      selectionIssues.push(issue(
        "selection_cohort_quota",
        "$.samples",
        `${cohort} 必须为 12 张，当前为 ${cohortCounts[cohort]} 张。`
      ));
    }
  }
  if (realEligibleCount !== 60) {
    selectionIssues.push(issue(
      "selection_real_sample_count",
      "$.samples",
      `正式选型需要 60 张非合成、已授权且已脱敏截图，当前为 ${realEligibleCount} 张。`
    ));
  }
  if (independentReviewCount < 12) {
    selectionIssues.push(issue(
      "selection_second_review_quota",
      "$.samples",
      `至少 12 张需有第二位评审，当前为 ${independentReviewCount} 张。`
    ));
  }

  return {
    validForDevelopment: issues.length === 0,
    readyForSelection: selectionIssues.length === 0,
    issues,
    selectionIssues,
    stats: {
      sampleCount: dataset.samples.length,
      realEligibleCount,
      independentReviewCount,
      cohortCounts
    }
  };
}

function validateAnnotation(annotation, basePath, issues) {
  if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) {
    issues.push(issue("golden_annotation", basePath, "annotation 必须是对象。"));
    return;
  }
  const stringArrays = [
    "acceptedMemoryStatements",
    "acceptableContentTypes",
    "evidenceRegionIds",
    "acceptableQuestionTypes",
    "acceptedAnswers",
    "acceptableDistractors"
  ];
  for (const key of stringArrays) {
    if (!Array.isArray(annotation[key]) || annotation[key].some((item) => typeof item !== "string")) {
      issues.push(issue("golden_annotation_array", `${basePath}.${key}`, `${key} 必须是字符串数组。`));
    }
  }
  for (const key of ["disposition", "riskDomain", "retentionIntent"]) {
    if (typeof annotation[key] !== "string" || !annotation[key].trim()) {
      issues.push(issue("golden_annotation_string", `${basePath}.${key}`, `${key} 必须是非空字符串。`));
    }
  }
  if (typeof annotation.verifiedVisibleText !== "string" || !annotation.verifiedVisibleText.trim()) {
    issues.push(issue(
      "golden_verified_visible_text",
      `${basePath}.verifiedVisibleText`,
      "verifiedVisibleText 必须是人工逐字核对后的非空可见文本。"
    ));
  }
  if (![1, 2].includes(Number(annotation.reviewerCount))) {
    issues.push(issue("golden_reviewer_count", `${basePath}.reviewerCount`, "reviewerCount 必须为 1 或 2。"));
  }
}

function resolveSamplePaths(sample, rootDir) {
  if (!sample || typeof sample !== "object") return sample;
  const output = structuredClone(sample);
  if (typeof output.imagePath === "string" && output.imagePath.trim()) {
    output.imagePath = path.resolve(rootDir, output.imagePath);
  }
  if (output.input?.image?.path) {
    output.input.image.path = path.resolve(rootDir, output.input.image.path);
  }
  return output;
}

function readiness(issues, samples) {
  return {
    validForDevelopment: false,
    readyForSelection: false,
    issues,
    selectionIssues: issues,
    stats: { sampleCount: samples.length }
  };
}

function issue(code, pathValue, message) {
  return { code, path: pathValue, message };
}
