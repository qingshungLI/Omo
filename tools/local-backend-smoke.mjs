import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const backendRoot = resolve(projectRoot, "backend");
const host = "127.0.0.1";
const port = 5174;
const baseUrl = `http://${host}:${port}`;
const timeoutMs = 20_000;
const output = [];

const child = spawn(process.execPath, ["src/start.js"], {
  cwd: backendRoot,
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    GENERATION_WORKER_DISABLED: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output.push(text);
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output.push(text);
  process.stderr.write(text);
});

let completed = false;

try {
  const health = await waitForHealth();
  assert(health.ok === true, "health.ok must be true");
  assert(health.storage === "postgres", "health.storage must be postgres");
  assert(health.database?.ok === true, "health.database.ok must be true");

  const version = await getJson("/api/version");
  assert(Boolean(version), "version endpoint must return JSON");

  const sourceCapabilities = await getJson("/api/source/capabilities");
  assert(Boolean(sourceCapabilities), "source capabilities endpoint must return JSON");

  const deviceA = await getJson("/api/chapters", {
    "X-Device-Id": "local-smoke-device-a"
  });
  const deviceB = await getJson("/api/chapters", {
    "X-Device-Id": "local-smoke-device-b"
  });
  assert(Array.isArray(deviceA.chapters), "device A chapter list must be an array");
  assert(Array.isArray(deviceB.chapters), "device B chapter list must be an array");

  completed = true;
  console.log("\nLocal backend smoke test passed.");
  console.log(JSON.stringify({
    health: {
      ok: health.ok,
      storage: health.storage,
      database: health.database
    },
    version: version.version || version,
    sourceCapabilities: sourceCapabilities.capabilities || sourceCapabilities
  }, null, 2));
} catch (error) {
  console.error("\nLocal backend smoke test failed.");
  console.error(error instanceof Error ? error.message : error);
  const recentOutput = output.join("").trim().split(/\r?\n/).slice(-20).join("\n");
  if (recentOutput) {
    console.error("\nRecent backend output:");
    console.error(recentOutput);
  }
  process.exitCode = 1;
} finally {
  await stopChild();
}

if (!completed && !process.exitCode) {
  process.exitCode = 1;
}

async function waitForHealth() {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited before becoming healthy with code ${child.exitCode}.`);
    }
    try {
      return await getJson("/api/health");
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || "unknown");
  throw new Error(`Backend did not become healthy within ${timeoutMs}ms: ${message}`);
}

async function getJson(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function stopChild() {
  if (child.exitCode !== null) return;

  child.kill("SIGTERM");
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  const forced = delay(5_000).then(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  await Promise.race([exited, forced]);
}

