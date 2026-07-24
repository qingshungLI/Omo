import assert from "node:assert/strict";
import test from "node:test";

import { resolveYtDlpPythonPath } from "./ytDlpRuntime.js";

test("resolves repository-relative yt-dlp Python paths from backend", () => {
  assert.match(resolveYtDlpPythonPath(".runtime/paddle-ocr/bin/python"), /\.runtime\/paddle-ocr\/bin\/python$/);
});

test("keeps PATH executables unchanged", () => {
  assert.equal(resolveYtDlpPythonPath("python3"), "python3");
});
