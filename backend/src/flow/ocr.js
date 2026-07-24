import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 45_000;
const PROJECT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BUNDLED_PADDLE_PYTHON = resolve(PROJECT_ROOT, ".runtime/paddle-ocr/bin/python");
const BUNDLED_APPLE_VISION_OCR = resolve(PROJECT_ROOT, ".runtime/apple-vision-ocr");

export async function recognizeImage(imagePath, {
  pythonPath = process.env.PADDLEOCR_PYTHON || BUNDLED_PADDLE_PYTHON,
  appleVisionPath = process.env.APPLE_VISION_OCR_BIN || BUNDLED_APPLE_VISION_OCR,
  provider = process.env.OCR_PROVIDER || (platform() === "darwin" ? "apple-vision" : "paddle"),
  timeoutMs = Number(process.env.OCR_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  spawnImpl = spawn
} = {}) {
  const startedAt = Date.now();
  let appleVisionFailure = null;
  if (["apple", "apple-vision", "vision"].includes(String(provider).toLowerCase()) && await fileExists(appleVisionPath)) {
    try {
      const result = await runJsonProcess(appleVisionPath, [imagePath], { timeoutMs, spawnImpl });
      return normalizeResult(result, startedAt);
    } catch (error) {
      appleVisionFailure = String(error?.message || error).slice(0, 240);
    }
  }
  const scriptPath = resolve(new URL("./ocr.py", import.meta.url).pathname);
  const runner = await fileExists(pythonPath) ? pythonPath : "python3";
  const result = await runJsonProcess(runner, [scriptPath, imagePath], { timeoutMs, spawnImpl });
  return normalizeResult({
    ...result,
    fallback: result.fallback || appleVisionFailure
  }, startedAt);
}

function normalizeResult(result, startedAt) {
  return {
    provider: result.provider || "paddleocr",
    text: cleanText(result.text),
    lines: Array.isArray(result.lines) ? result.lines.map(cleanText).filter(Boolean) : [],
    latencyMs: Number(result.latencyMs) || Date.now() - startedAt,
    fallback: result.fallback || null
  };
}

async function runJsonProcess(command, args, { timeoutMs, spawnImpl }) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawnImpl(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill?.("SIGKILL");
      const error = new Error("OCR 识别超时。");
      error.code = "ocr_timeout";
      rejectResult(error);
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error.code = error.code === "ENOENT" ? "ocr_runtime_missing" : "ocr_failed";
      rejectResult(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
      let result;
      try { result = JSON.parse(line); } catch { result = null; }
      if (code === 0 && result) {
        resolveResult(result);
        return;
      }
      const error = new Error(result?.error || stderr.trim() || "OCR 识别失败。");
      error.code = result?.code || "ocr_failed";
      rejectResult(error);
    });
  });
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

function cleanText(value) {
  return String(value || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}
