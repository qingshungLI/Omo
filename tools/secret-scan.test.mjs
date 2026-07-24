import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectCurrentInputs,
  collectHistoryFindings,
  formatFinding,
  scanInputs,
  scanTextForSecrets
} from "./secret-scan.mjs";

function fakeQwenToken() {
  return ["sk-ws-", "FAKE.TEST_TOKEN_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ"].join("");
}

function fakeTikHubToken() {
  return [
    "ZmFrZS10aWtodWIt",
    "dG9rZW4tZm9yLXJlZ3Jlc3Npb24tdGVzdA=="
  ].join("");
}

function fakeDatabaseUrl() {
  return ["postgresql", "://recallo_fake:fake_password@db.example.invalid/recallo"].join("");
}

test("detects dotted Qwen tokens without printing the full value", () => {
  const token = fakeQwenToken();
  const findings = scanTextForSecrets(`QWEN_API=${token}`, { path: "fixture.env" });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "qwen_dotted_api_key");
  const output = formatFinding(findings[0]);
  assert.equal(output.includes(token), false);
  assert.match(output, /masked=sk-w…WXYZ/);
  assert.match(output, /sha256=[a-f0-9]{16}/);
});

test("detects TikHub base64 assignments", () => {
  const token = fakeTikHubToken();
  const findings = scanTextForSecrets(`TIKHUB_API_KEY=${token}`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "tikhub_base64_assignment");
  assert.equal(formatFinding(findings[0]).includes(token), false);
});

test("detects credential-bearing database URLs", () => {
  const url = fakeDatabaseUrl();
  const findings = scanTextForSecrets(`DATABASE_URL=${url}`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "database_url");
  assert.equal(formatFinding(findings[0]).includes(url), false);
});

test("empty and documented placeholder assignments remain valid", () => {
  const text = [
    "QWEN_API=",
    "TIKHUB_API_KEY=",
    "OPENAI_API_KEY=replace_me",
    "DATABASE_URL=",
    "BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1"
  ].join("\n");
  assert.deepEqual(scanTextForSecrets(text), []);
});

test("current scan reads both worktree and staged index content", () => {
  const directory = mkdtempSync(join(tmpdir(), "recallo-secret-current-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "security-test@example.invalid"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Recallo Security Test"], { cwd: directory });
    const fixturePath = join(directory, "fixture.env");
    writeFileSync(fixturePath, "QWEN_API=\n");
    execFileSync("git", ["add", "fixture.env"], { cwd: directory });
    execFileSync("git", ["commit", "-qm", "safe baseline"], { cwd: directory });

    writeFileSync(fixturePath, `QWEN_API=${fakeQwenToken()}\n`);
    execFileSync("git", ["add", "fixture.env"], { cwd: directory });
    writeFileSync(fixturePath, "QWEN_API=\n");

    const findings = scanInputs(collectCurrentInputs(directory));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].source, "index");
    assert.equal(findings[0].type, "qwen_dotted_api_key");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("history audit detects a removed secret without revealing it", () => {
  const directory = mkdtempSync(join(tmpdir(), "recallo-secret-history-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "security-test@example.invalid"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Recallo Security Test"], { cwd: directory });
    const fixturePath = join(directory, "fixture.env");
    const token = fakeTikHubToken();
    writeFileSync(fixturePath, `TIKHUB_API_KEY=${token}\n`);
    execFileSync("git", ["add", "fixture.env"], { cwd: directory });
    execFileSync("git", ["commit", "-qm", "add fixture"], { cwd: directory });
    writeFileSync(fixturePath, "TIKHUB_API_KEY=\n");
    execFileSync("git", ["add", "fixture.env"], { cwd: directory });
    execFileSync("git", ["commit", "-qm", "remove fixture"], { cwd: directory });

    const findings = collectHistoryFindings(directory);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].type, "tikhub_base64_assignment");
    assert.equal(formatFinding(findings[0]).includes(token), false);
    assert.match(findings[0].source, /^commit:[a-f0-9]{12}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
