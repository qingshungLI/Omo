import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

// .env paths are conventionally relative to the repository root, while the
// backend process runs from backend/. Keep both yt-dlp entry points consistent.
export function resolveYtDlpPythonPath(value = process.env.YT_DLP_PYTHON || process.env.PYTHON_PATH || "python3") {
  const configured = String(value || "python3").trim() || "python3";
  if (!configured.includes("/") && !configured.includes("\\")) return configured;
  return resolve(PROJECT_ROOT, configured);
}
