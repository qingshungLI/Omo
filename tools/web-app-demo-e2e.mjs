#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backendRoot = resolve(repoRoot, "backend");
const requireFromBackend = createRequire(resolve(backendRoot, "package.json"));
const { chromium } = requireFromBackend("playwright");
const port = Number(process.env.RECALLO_WEB_E2E_PORT || 18764);
const externalBaseURL = process.env.RECALLO_WEB_E2E_BASE_URL?.replace(/\/$/, "");
const baseURL = externalBaseURL || `http://127.0.0.1:${port}`;
const realMode = process.env.RECALLO_WEB_E2E_REAL === "1";
const deterministicFixtureMode = process.env.RECALLO_E2E_FIXTURE_MODE === "1";
const screenshotPath = process.env.RECALLO_WEB_E2E_SCREENSHOT || `/tmp/recallo-web-app-demo-e2e-${realMode ? "real" : "mock"}.png`;
let serverProcess = null;
let serverOutput = "";

const firstSchedule = {
  nextReviewAt: "2020-01-01T00:00:00.000Z",
  intervalDays: 0,
  state: "scheduled",
  status: "scheduled"
};
const nextSchedule = {
  nextReviewAt: "2099-07-28T11:00:00.000Z",
  intervalDays: 3,
  state: "scheduled",
  status: "scheduled"
};
const sourceContext = {
  schemaVersion: "capture_source_context_1",
  nearbyText: "主动回忆能强化长期记忆的提取路径，随后应在遗忘前再次激活。",
  overview: {
    summary: "这段内容对比重读与主动回忆，并说明间隔复习如何延续提取效果。",
    highlights: ["重读产生熟悉感", "主动回忆强化提取", "间隔复习延续效果"]
  },
  completeness: "full",
  blocks: [
    { id: "context-1", type: "paragraph", sourceRole: "before", startSeconds: 0, endSeconds: 24, text: "直接重读主要增加熟悉感，不等同于能够独立提取。" },
    { id: "context-2", type: "paragraph", sourceRole: "screenshot_nearby", startSeconds: 25, endSeconds: 48, text: "主动回忆能强化长期记忆的提取路径。" },
    { id: "context-3", type: "paragraph", sourceRole: "screenshot_nearby", startSeconds: 49, endSeconds: 78, text: "随后通过间隔复习，让提取路径在遗忘前被再次激活。" },
    { id: "context-4", type: "paragraph", sourceRole: "after", startSeconds: 79, endSeconds: 102, text: "同一方法可以用于概念、事实和步骤复习。" }
  ],
  focusBlockIds: ["context-2", "context-3"]
};
const memoryCard = {
  id: "e2e-memory-card-1",
  captureId: "e2e-capture-1",
  version: 2,
  state: "formal",
  coreKnowledge: "主动回忆能强化长期记忆的提取路径。",
  recallCue: "什么行为能强化长期记忆的提取路径？",
  hiddenSemantic: "主动回忆",
  explanation: "答案直接来自截图证据区域。",
  sourceEvidenceIds: ["evidence-1"],
  rarity: "SR",
  rarityReason: "SR · 可迁移到不同学习场景的方法。",
  rarityConfidence: 0.92,
  rarityRuleVersion: "recallo_rarity_v1",
  recallVariants: [],
  sourceTitle: "E2E B站截图",
  sourceUrl: "https://www.bilibili.com/video/BV1E2E",
  sourceStatus: "verified",
  captureGroup: {
    captureId: "e2e-capture-1",
    cardIds: ["e2e-memory-card-1", "e2e-memory-card-2"],
    count: 2,
    index: 0
  },
  sourceContext
};
const relatedMemoryCard = {
  ...memoryCard,
  id: "e2e-memory-card-2",
  coreKnowledge: "间隔复习让同一提取路径在遗忘前被再次激活。",
  recallCue: "间隔复习如何延续主动回忆的效果？",
  hiddenSemantic: "遗忘前被再次激活",
  rarity: "R",
  rarityReason: "R · 对复习时机的局部解释。",
  captureGroup: {
    captureId: "e2e-capture-1",
    cardIds: ["e2e-memory-card-1", "e2e-memory-card-2"],
    count: 2,
    index: 1
  },
  sourceContext
};
const memoryCards = [memoryCard, relatedMemoryCard];
const nearbyOnlyCard = {
  ...memoryCard,
  id: "e2e-memory-card-nearby-only",
  captureGroup: null,
  sourceContext: {
    ...sourceContext,
    completeness: "screenshot_only",
    blocks: [],
    focusBlockIds: []
  }
};

async function main() {
  if (!externalBaseURL) {
    serverProcess = spawn(process.execPath, ["src/server.js"], {
      cwd: backendRoot,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        NODE_ENV: "test",
        GENERATION_WORKER_DISABLED: "1",
        DATABASE_URL: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    serverProcess.stdout.on("data", chunk => { serverOutput += chunk; });
    serverProcess.stderr.on("data", chunk => { serverOutput += chunk; });
    await waitForServer(`${baseURL}/app-demo`, serverProcess);
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
  });
  try {
    const api = makeAPIFixture();
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      reducedMotion: "no-preference"
    });
    if (!realMode) await installAPIRoutes(context, api);
    const page = await context.newPage();
    observeAPI(page, api, realMode);
    await page.addInitScript(() => { window.__RECALLO_E2E__ = true; });
    const consoleErrors = [];
    const requestFailures = [];
    const responseFailures = [];
    page.on("console", message => {
      if (message.type() === "error") {
        const location = message.location();
        consoleErrors.push(`${message.text()}${location.url ? ` @ ${location.url}` : ""}`);
      }
    });
    page.on("requestfailed", request => {
      requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
    });
    page.on("response", response => {
      if (response.status() >= 400) responseFailures.push(`${response.request().method()} ${response.url()} ${response.status()}`);
    });

    await page.goto(`${baseURL}/app-demo`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="v06-home"]').waitFor();
    assert.equal(await page.locator("script#recallo-v06-runtime").count(), 1, "the page must expose exactly one current runtime");
    assert.equal(await page.locator('[data-testid="recall-stack"]').isDisabled(), true, "empty library must not summon fixture content");

    await page.getByRole("button", { name: "添加第一张截图" }).click();
    const fixture = realMode ? loadRealFixture() : {
      name: "bilibili-e2e.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nC8AAAAASUVORK5CYII=", "base64")
    };
    await page.locator('[data-testid="capture-file"]').setInputFiles(fixture);
    await page.locator('[data-testid="submit-capture"]').click();
    const captureProgress = page.locator('[data-testid="capture-progress"]');
    const captureTimeoutMs = Number(process.env.RECALLO_WEB_E2E_TIMEOUT || (realMode ? 180_000 : 8_000));
    await waitForCaptureUIOutcome(page, api, captureTimeoutMs, "capture-progress");
    assert.doesNotMatch(
      await captureProgress.textContent(),
      /\d+\s*%/,
      "capture processing must show a truthful stage label rather than a synthesized percentage"
    );
    await waitForCaptureUIOutcome(
      page,
      api,
      captureTimeoutMs
    );
    assert.equal(api.capturePosts, 1, "upload must submit exactly one capture job");
    assert.equal(api.capturePolls >= 1, true, "the UI must poll the async job until success");
    assert.equal(api.lastCaptureBody.async, true, "capture request must use explicit async mode");
    assert.ok(
      api.lastCaptureBody.imageBase64.startsWith(`data:${fixture.mimeType};base64,`),
      `the selected user file must be sent as ${fixture.mimeType} image data`
    );
    assert.equal(api.lastCaptureBody.mimeType, fixture.mimeType);
    const backendEvidence = realMode
      ? validateBackendEvidence(await waitForFinalCaptureJob(api), fixture)
      : null;

    await page.getByRole("button", { name: "请它取回这张", exact: true }).click();
    await page.locator('[data-testid="v06-summoning"]').waitFor();
    assert.equal(
      await page.locator(".summon-card").getAttribute("data-duration"),
      "1800",
      "the first standard-motion summon must use the frozen 1800ms duration"
    );
    await page.getByRole("button", { name: "跳过" }).click();
    await page.locator('[data-testid="v06-recall"]').waitFor();
    if (!realMode) {
      assert.equal(await page.locator('[data-testid="memory-group"]').getAttribute("data-group-count"), "2", "a dense source must expose its multi-card group");
      assert.equal(await page.locator("article.memory").count(), 1, "the recall surface must still present one card at a time");
      assert.match(await page.locator('[data-testid="memory-group-note"]').innerText(), /当前 1 \/ 2/);
      assert.equal(await page.getByRole("button", { name: "查看脉络并揭晓" }).count(), 1);
      assert.doesNotMatch(
        await page.locator('[data-testid="v06-recall"]').innerText(),
        new RegExp(memoryCard.hiddenSemantic),
        "the hidden semantic must not be present in readable DOM text before an explicit reveal"
      );
    }

    const scratch = page.locator("canvas.scratch");
    const box = await scratch.boundingBox();
    assert.ok(box, "scratch canvas must be visible");
    await page.mouse.move(box.x + 24, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 74, box.y + 24, { steps: 4 });
    await page.mouse.up();
    const partialCoverage = await page.evaluate(() => window.__recalloV06.getState().coverage);
    assert.ok(partialCoverage > 0 && partialCoverage < 0.45, `partial scratch must remain below reveal threshold, got ${partialCoverage}`);

    await page.reload({ waitUntil: "networkidle" });
    const paused = page.locator('[data-testid="v06-paused"]');
    if (await paused.count()) {
      await page.getByRole("button", { name: "继续回忆" }).click();
    }
    await page.locator('[data-testid="v06-recall"]').waitFor();
    const restoredCoverage = await page.evaluate(() => window.__recalloV06.getState().coverage);
    assert.equal(restoredCoverage, partialCoverage, "reload must restore the same scratch coverage");

    await page.locator("canvas.scratch").press("Enter");
    await page.getByRole("button", { name: "记得" }).click();
    await page.locator('[data-testid="v06-checkpoint"]').waitFor({ timeout: 5_000 });
    assert.equal(api.assessmentPosts, 1, "assessment must be persisted through the API");
    assert.equal(api.lastAssessmentBody.assessment, "remembered");
    assert.match(api.lastAssessmentBody.attemptId, /^web-capture-assessment-/);
    const observedNextReviewAt = await page.locator('[data-testid="next-review"]').getAttribute("data-next-review-at");
    assert.ok(observedNextReviewAt && Number.isFinite(Date.parse(observedNextReviewAt)), "checkpoint must expose a valid server nextReviewAt");
    assert.ok(Date.parse(observedNextReviewAt) > Date.now(), "remembered assessment must advance the next review into the future");
    if (!realMode) assert.equal(observedNextReviewAt, nextSchedule.nextReviewAt, "mock checkpoint must use its server schedule exactly");
    if (!realMode) {
      assert.equal(await page.locator('[data-testid="continue-recall"]').innerText(), "继续下一张", "the unassessed sibling card must remain independently due");
      const assessedState = await page.evaluate(() => window.__recalloV06.getState());
      const assessedPrimary = assessedState.cards.find(card => card.id === "e2e-memory-card-1");
      const untouchedSibling = assessedState.cards.find(card => card.id === "e2e-memory-card-2");
      assert.equal(assessedPrimary.schedule.nextReviewAt, nextSchedule.nextReviewAt);
      assert.equal(untouchedSibling.schedule.nextReviewAt, firstSchedule.nextReviewAt, "assessing the primary card must not alter its sibling schedule");
      assert.equal(untouchedSibling.lastAssessment, "", "assessing the primary card must not mark its sibling assessed");
    }

    await page.getByRole("button", { name: "先收好", exact: true }).click();
    await page.locator('[data-testid="v06-home"]').waitFor({ timeout: 3_000 });
    if (!realMode) assert.equal(await page.locator('[data-testid="recall-stack"]').isDisabled(), false, "the due sibling must remain available after the primary card is assessed");
    assert.equal(api.assessmentPosts, 1, "the same future card must not be assessed twice");
    await page.getByRole("button", { name: "知识库" }).click();
    await page.locator('[data-testid="v06-library"]').waitFor();
    const libraryCountBeforeDelete = await page.locator('[data-testid="library-card"]').count();
    if (!realMode) assert.equal(libraryCountBeforeDelete, 2, "all generated cards must appear as independent library entries");
    else assert.ok(libraryCountBeforeDelete >= 1);
    const deleteTarget = realMode ? page.locator("[data-delete]").first() : page.locator('[data-delete="e2e-memory-card-1"]');
    await deleteTarget.click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await page.waitForFunction(expected => document.querySelectorAll('[data-testid="library-card"]').length === expected, libraryCountBeforeDelete - 1);
    assert.equal(api.deleteRequests, 1, "delete must call the card API before removing UI state");
    if (!realMode) {
      assert.equal(api.cards.length, 1, "deleting the primary card must keep its sibling server record");
      assert.equal(await page.locator('[data-card-id="e2e-memory-card-2"]').count(), 1, "deleting the primary card must leave the sibling in the library");
      const afterDelete = await page.evaluate(() => window.__recalloV06.getState());
      assert.deepEqual(afterDelete.cards.map(card=>card.id), ["e2e-memory-card-2"]);
      assert.deepEqual(afterDelete.cards[0].memoryCards.map(card=>card.id), ["e2e-memory-card-2"], "the remaining card group must not resurrect the deleted primary");
      assert.equal(afterDelete.cards[0].captureGroup.count, 1);
      assert.equal(afterDelete.cards[0].captureGroup.index, 0);
    }

    let failureStayedVisible = null;
    if (!realMode) {
      api.failNextCapture = true;
      await page.getByRole("button", { name: "添加截图" }).click();
      await page.locator('[data-testid="capture-file"]').setInputFiles(fixture);
      await page.locator('[data-testid="submit-capture"]').click();
      await assert.rejects(
        waitForCaptureUIOutcome(page, api, 8_000),
        error => {
          assert.match(error.message, /capture upload failed/);
          assert.match(error.message, /E2E 明确失败/);
          assert.doesNotMatch(error.message, /imageBase64|data:image/);
          return true;
        }
      );
      assert.match(await page.locator('[data-testid="upload-error"]').innerText(), /E2E 明确失败/);
      assert.equal(await page.locator('[data-testid="v06-upload-complete"]').count(), 0, "failed API must never become fixture success");
      failureStayedVisible = true;
    }

    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
    assert.ok(overflow <= 0, `375px viewport must not overflow, got ${overflow}px`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const expectedFailureStatus = failureStayedVisible ? 422 : null;
    const unexpectedResponses = responseFailures.filter(message => !expectedFailureStatus || !message.endsWith(` ${expectedFailureStatus}`));
    assert.deepEqual(unexpectedResponses, [], `HTTP errors: ${unexpectedResponses.join(" | ")}`);
    const unexpectedConsoleErrors = consoleErrors.filter(message => {
      if (message.endsWith(`@ ${baseURL}/favicon.ico`)) return false;
      return !(expectedFailureStatus && message.includes(`status of ${expectedFailureStatus}`));
    });
    assert.deepEqual(unexpectedConsoleErrors, [], `console errors: ${unexpectedConsoleErrors.join(" | ")}`);
    const unexpectedRequestFailures = requestFailures.filter(message => !(/app-demo-assets\//.test(message) && /net::ERR_ABORTED/.test(message)));
    assert.deepEqual(unexpectedRequestFailures, [], `request failures: ${unexpectedRequestFailures.join(" | ")}`);
    await context.close();

    let nextDuration = null;
    let reducedDuration = null;
    if (!realMode) {
      api.cards = [
        recordFor(memoryCard, firstSchedule, null),
        recordFor(relatedMemoryCard, firstSchedule, null)
      ];
      const nextContext = await browser.newContext({
        viewport: { width: 375, height: 812 }
      });
      await installAPIRoutes(nextContext, api);
      const nextPage = await nextContext.newPage();
      await nextPage.addInitScript(() => {
        window.__RECALLO_E2E__ = true;
        localStorage.setItem("recallo-v06-web-state-v2", JSON.stringify({ summonCount: 1, assessments: { sentinel: "remembered" } }));
      });
      await nextPage.goto(`${baseURL}/app-demo`, { waitUntil: "networkidle" });
      const refreshedGroup = await nextPage.evaluate(() => window.__recalloV06.getState().cards);
      assert.deepEqual(refreshedGroup.map(card=>card.id), ["e2e-memory-card-1", "e2e-memory-card-2"], "GET records must rebuild all captureGroup siblings after a restart");
      assert.deepEqual(refreshedGroup[0].memoryCards.map(card=>card.id), ["e2e-memory-card-1", "e2e-memory-card-2"], "captureGroup.cardIds must rebuild the visible stack");
      assert.deepEqual(refreshedGroup.map(card=>card.captureGroup.index), [0, 1], "captureGroup must preserve zero-based card positions");
      assert.equal(refreshedGroup[0].sourceContext.schemaVersion, "capture_source_context_1");
      assert.deepEqual(refreshedGroup[0].sourceContext.overview, sourceContext.overview);
      assert.equal(refreshedGroup[0].sourceContext.completeness, "full");
      assert.equal(refreshedGroup[0].sourceContext.blocks[1].sourceRole, "screenshot_nearby");
      assert.equal(refreshedGroup[0].sourceContext.blocks[1].startSeconds, 25);
      assert.equal(refreshedGroup[0].sourceContext.blocks[1].endSeconds, 48);
      await nextPage.getByRole("button", { name: "请它取回一张" }).click();
      await nextPage.locator('[data-testid="v06-summoning"]').waitFor();
      nextDuration = Number(await nextPage.locator(".summon-card").getAttribute("data-duration"));
      assert.equal(nextDuration, 900, "a subsequent standard-motion summon must use the frozen 900ms duration");
      await nextPage.getByRole("button", { name: "跳过" }).click();
      await nextPage.locator('[data-testid="v06-recall"]').waitFor();
      const groupExpand = nextPage.getByRole("button", { name: "查看脉络并揭晓" });
      const expandBox = await groupExpand.boundingBox();
      assert.ok(expandBox && expandBox.width >= 44 && expandBox.height >= 44, "the context expand control must keep a 44px hit target");
      assert.doesNotMatch(
        await nextPage.locator('[data-testid="v06-recall"]').innerText(),
        new RegExp(memoryCard.hiddenSemantic),
        "the answer must remain absent from readable DOM text before context is explicitly opened"
      );
      const nextScratch = nextPage.locator("canvas.scratch");
      const nextScratchBox = await nextScratch.boundingBox();
      assert.ok(nextScratchBox);
      await nextPage.mouse.move(nextScratchBox.x + 22, nextScratchBox.y + 22);
      await nextPage.mouse.down();
      await nextPage.mouse.move(nextScratchBox.x + 66, nextScratchBox.y + 22, { steps: 3 });
      await nextPage.mouse.up();
      const beforeContext = await nextPage.evaluate(() => window.__recalloV06.getState());
      await groupExpand.click();
      await nextPage.locator('[data-testid="context-dialog"]').waitFor();
      await nextPage.waitForFunction(() => document.activeElement?.getAttribute("data-focus-block") === "true");
      const afterContext = await nextPage.evaluate(() => window.__recalloV06.getState());
      assert.equal(afterContext.revealed, true, "opening context before reveal must use the same explicit reveal state");
      assert.equal(afterContext.coverage, 1, "explicit context reveal must complete the scratch layer");
      assert.deepEqual(afterContext.paths, beforeContext.paths, "opening context must preserve scratch paths");
      assert.deepEqual(afterContext.assessments, beforeContext.assessments, "opening context must not reset assessments");
      assert.equal(await nextPage.locator('[data-testid="context-block"][data-focus-block="true"]').count(), 2, "all screenshot-nearby blocks must be highlighted");
      assert.equal(await nextPage.getByText("截图附近", { exact: true }).count(), 2, "each focused block must carry an explicit screenshot-nearby marker");
      const dialogText = await nextPage.locator('[data-testid="context-dialog"]').innerText();
      assert.match(dialogText, /内容概览/);
      assert.match(dialogText, /脉络较完整/);
      assert.match(dialogText, new RegExp(sourceContext.overview.highlights[1]));
      assert.match(dialogText, /0:25–0:48/);
      assert.ok(dialogText.indexOf(sourceContext.overview.summary) < dialogText.indexOf(memoryCard.hiddenSemantic), "overview must appear before the source blocks");
      assert.match(dialogText, new RegExp(memoryCard.hiddenSemantic));
      const contextOverflow = await nextPage.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
      assert.ok(contextOverflow <= 0, `context dialog must not overflow a 375px viewport, got ${contextOverflow}px`);
      assert.equal(
        await nextPage.evaluate(() => document.activeElement?.getAttribute("data-focus-block")),
        "true",
        "the first screenshot-nearby block must receive initial dialog focus"
      );
      await nextPage.keyboard.press("Escape");
      await nextPage.locator('[data-testid="context-dialog"]').waitFor({ state: "detached" });
      await nextPage.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "context-expand");
      assert.equal(
        await nextPage.evaluate(() => document.activeElement?.getAttribute("data-testid")),
        "context-expand",
        "Escape must close the dialog and return focus to the expand control"
      );
      const revealedExpand = nextPage.getByRole("button", { name: "查看内容脉络" });
      await revealedExpand.click();
      await nextPage.getByRole("button", { name: "关闭内容脉络" }).click();
      await nextPage.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "context-expand");
      assert.equal(
        await nextPage.evaluate(() => document.activeElement?.getAttribute("data-testid")),
        "context-expand",
        "the close button must return focus without resetting the revealed recall state"
      );
      await nextContext.close();

      api.cards = [recordFor(memoryCard, firstSchedule, null, { includeGroup: false })];
      const reducedContext = await browser.newContext({
        viewport: { width: 375, height: 812 },
        reducedMotion: "reduce"
      });
      await installAPIRoutes(reducedContext, api);
      const reducedPage = await reducedContext.newPage();
      await reducedPage.addInitScript(() => { window.__RECALLO_E2E__ = true; });
      await reducedPage.goto(`${baseURL}/app-demo`, { waitUntil: "networkidle" });
      const startedAt = Date.now();
      await reducedPage.getByRole("button", { name: "请它取回一张" }).click();
      await reducedPage.locator('[data-testid="v06-summoning"]').waitFor();
      assert.equal(
        await reducedPage.locator(".summon-card").getAttribute("data-duration"),
        "180",
        "Reduce Motion must use the frozen 180ms duration"
      );
      await reducedPage.locator('[data-testid="v06-recall"]').waitFor({ timeout: 1_000 });
      reducedDuration = Date.now() - startedAt;
      assert.ok(reducedDuration < 800, `Reduce Motion summon must finish quickly, got ${reducedDuration}ms`);
      assert.equal(await reducedPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
      assert.equal(await reducedPage.locator('[data-testid="memory-group"]').getAttribute("data-group-count"), "1", "legacy singular memoryCard records must remain reviewable");
      assert.equal(await reducedPage.locator('[data-testid="context-expand"]').count(), 0, "a singular legacy card without source context must not show a fake expand control");
      await reducedContext.close();

      api.cards = [recordFor(nearbyOnlyCard, firstSchedule, null)];
      const nearbyContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await installAPIRoutes(nearbyContext, api);
      const nearbyPage = await nearbyContext.newPage();
      await nearbyPage.addInitScript(() => { window.__RECALLO_E2E__ = true; });
      await nearbyPage.goto(`${baseURL}/app-demo`, { waitUntil: "networkidle" });
      await nearbyPage.getByRole("button", { name: "请它取回一张" }).click();
      await nearbyPage.locator('[data-testid="v06-summoning"]').waitFor();
      await nearbyPage.getByRole("button", { name: "跳过" }).click();
      await nearbyPage.getByRole("button", { name: "查看脉络并揭晓" }).click();
      const nearbyFallback = nearbyPage.locator('[data-testid="context-nearby-fallback"]');
      await nearbyFallback.waitFor();
      assert.match(await nearbyFallback.innerText(), new RegExp(sourceContext.nearbyText));
      assert.match(await nearbyPage.locator('[data-testid="context-dialog"]').innerText(), /仅截图附近/);
      assert.equal(await nearbyPage.locator('[data-testid="context-block"]').count(), 0, "missing blocks must show nearbyText without inventing an article outline");
      await nearbyContext.close();
    }

    console.log("# Recallo Web App Demo E2E");
    console.log(JSON.stringify({
      baseURL,
      mode: realMode ? "real-backend-fixture" : "mock-route",
      viewport: "375x812",
      upload: { posts: api.capturePosts, polls: api.capturePolls, usedSelectedFile: true },
      recall: { partialCoverage, restoredCoverage, assessmentPosts: api.assessmentPosts, nextDuration },
      schedule: observedNextReviewAt,
      deleteRequests: api.deleteRequests,
      failureStayedVisible,
      reducedMotionMs: reducedDuration,
      ...(backendEvidence ? { backend: backendEvidence } : {}),
      screenshotPath
    }, null, 2));
  } finally {
    await browser.close();
  }
}

function makeAPIFixture() {
  return {
    cards: [],
    capturePosts: 0,
    capturePolls: 0,
    assessmentPosts: 0,
    deleteRequests: 0,
    lastCaptureBody: null,
    lastCaptureJob: null,
    lastAssessmentBody: null,
    failNextCapture: false
  };
}

function observeAPI(page, api, enabled) {
  if (!enabled) return;
  page.on("request", request => {
    const { pathname } = new URL(request.url());
    const method = request.method();
    if (method === "POST" && pathname === "/api/sources/image-flow") {
      api.capturePosts += 1;
      api.lastCaptureBody = request.postDataJSON();
    } else if (method === "GET" && pathname.startsWith("/api/sources/image-flow/jobs/")) {
      api.capturePolls += 1;
    } else if (method === "POST" && /\/api\/memory-cards\/[^/]+\/assessments$/.test(pathname)) {
      api.assessmentPosts += 1;
      api.lastAssessmentBody = request.postDataJSON();
    } else if (method === "DELETE" && /\/api\/memory-cards\/[^/]+$/.test(pathname)) {
      api.deleteRequests += 1;
    }
  });
  page.on("response", async response => {
    try {
      const { pathname } = new URL(response.url());
      if (
        response.request().method() !== "GET"
        || !/^\/api\/sources\/image-flow\/jobs\/[^/]+$/.test(pathname)
      ) return;
      const payload = await response.json();
      if (["succeeded", "failed"].includes(payload?.status)) api.lastCaptureJob = payload;
    } catch {
      // The assertions below report a missing terminal job with a stable error.
    }
  });
}

function loadRealFixture() {
  const manifestPath = process.env.RECALLO_WEB_E2E_MANIFEST
    || join(backendRoot, "test-fixtures", "capture-gallery", "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`real E2E fixture manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entries = Array.isArray(manifest)
    ? manifest
    : manifest.fixtures || manifest.samples || manifest.items || manifest.images || [];
  const requested = process.env.RECALLO_WEB_E2E_FIXTURE;
  const selected = requested
    ? entries.find(entry => entry.id === requested || entry.file === requested)
    : entries.find(entry => ["bilibili", "douyin"].includes(entry.expectedPlatform)) || entries[0];
  if (!selected) throw new Error(`real E2E manifest has no usable fixture: ${manifestPath}`);
  const relativeFile = typeof selected === "string"
    ? selected
    : selected.file || selected.path || selected.image || selected.imagePath || selected.fixture;
  const fixturePath = resolve(dirname(manifestPath), relativeFile);
  if (!existsSync(fixturePath)) throw new Error(`real E2E fixture not found: ${fixturePath}`);
  const extension = extname(fixturePath).toLowerCase();
  const mimeType = selected.mimeType
    || ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" })[extension]
    || "image/png";
  const expectedPlatform = typeof selected === "string"
    ? ""
    : String(selected.expectedPlatform || "").trim().toLowerCase();
  return { name: basename(fixturePath), mimeType, expectedPlatform, buffer: readFileSync(fixturePath) };
}

async function waitForFinalCaptureJob(api, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!api.lastCaptureJob && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(api.lastCaptureJob, "real backend E2E must capture the terminal image-flow job response");
  return api.lastCaptureJob;
}

async function waitForCaptureUIOutcome(page, api, timeoutMs, successTestId = "v06-upload-complete") {
  const success = page.locator(`[data-testid="${successTestId}"]`);
  const uploadError = page.locator('[data-testid="upload-error"]');
  const outcome = await Promise.race([
    success.waitFor({ timeout: timeoutMs }).then(() => "complete"),
    uploadError.waitFor({ timeout: timeoutMs }).then(() => "error")
  ]);
  if (outcome === "complete") return;

  const uiError = sanitizeDiagnosticText(await uploadError.innerText(), 320);
  const terminalJob = await waitForObservedTerminalJob(api, 300);
  const diagnostic = {
    uiError,
    terminalJob: {
      captured: Boolean(terminalJob),
      status: diagnosticField(terminalJob?.status),
      errorCode: diagnosticField(
        terminalJob?.errorCode
        || terminalJob?.error?.errorCode
        || terminalJob?.error?.code
        || terminalJob?.result?.errorCode
        || terminalJob?.result?.error?.code
      ),
      stage: diagnosticField(
        terminalJob?.progress?.stage
        || terminalJob?.error?.stage
        || terminalJob?.result?.stage
      ),
      provider: diagnosticField(
        terminalJob?.provider
        || terminalJob?.error?.provider
        || terminalJob?.result?.error?.provider
        || terminalJob?.result?.provider
        || terminalJob?.result?.capture?.provider
        || terminalJob?.result?.search?.provider
      )
    }
  };
  throw new Error(`capture upload failed: ${JSON.stringify(diagnostic)}`);
}

async function waitForObservedTerminalJob(api, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!api.lastCaptureJob && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return api.lastCaptureJob;
}

function diagnosticField(value) {
  return sanitizeDiagnosticText(value, 80);
}

function sanitizeDiagnosticText(value, maxLength) {
  const normalized = String(value || "")
    .replace(/data:image\/[^;,\s]+;base64,[A-Za-z0-9+/=]+/gi, "[redacted-image]")
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/gi, "[redacted-secret]")
    .replace(/\b[A-Za-z0-9+/]{120,}={0,2}\b/g, "[redacted-long-value]")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function validateBackendEvidence(job, fixture) {
  const evidence = {
    jobStatus: String(job?.status || ""),
    resultStatus: String(job?.result?.status || ""),
    platform: String(job?.result?.capture?.identity?.platform || ""),
    captureProvider: String(job?.result?.capture?.provider || ""),
    searchProvider: String(job?.result?.search?.provider || "")
  };
  assert.equal(evidence.jobStatus, "succeeded", "real backend image-flow job must succeed");
  assert.equal(evidence.resultStatus, "completed", "real backend image flow must complete");
  assert.ok(evidence.platform, "real backend result must expose the detected platform");
  if (fixture.expectedPlatform) {
    assert.equal(evidence.platform, fixture.expectedPlatform, "detected platform must match the selected manifest fixture");
  }
  const expectedProvider = deterministicFixtureMode ? "recallo-e2e-fixture" : "qwen-vision";
  const expectedSearchProvider = deterministicFixtureMode ? "recallo-e2e-fixture" : "tikhub";
  assert.equal(evidence.captureProvider, expectedProvider, "capture provider must match the requested E2E provider mode");
  assert.equal(evidence.searchProvider, expectedSearchProvider, "search provider must match the requested E2E provider mode");
  return evidence;
}

async function installAPIRoutes(context, api) {
  await context.route("**/api/memory-cards", async route => {
    const request = route.request();
    if (request.method() === "GET") {
      return fulfillJSON(route, 200, { cards: api.cards });
    }
    return route.continue();
  });
  await context.route("**/api/sources/image-flow", async route => {
    api.capturePosts += 1;
    api.lastCaptureBody = route.request().postDataJSON();
    if (api.failNextCapture) {
      api.failNextCapture = false;
      return fulfillJSON(route, 422, { errorCode: "e2e_capture_failed", message: "E2E 明确失败" });
    }
    api.capturePolls = 0;
    return fulfillJSON(route, 202, { jobId: "11111111-1111-4111-8111-111111111111", status: "queued" });
  });
  await context.route("**/api/sources/image-flow/jobs/**", async route => {
    api.capturePolls += 1;
    if (api.capturePolls === 1) {
      return fulfillJSON(route, 200, { status: "running", progress: { stage: "vision", message: "正在识别截图" } });
    }
    api.cards = [
      recordFor(memoryCard, firstSchedule, null),
      recordFor(relatedMemoryCard, firstSchedule, null)
    ];
    return fulfillJSON(route, 200, {
      status: "succeeded",
      progress: { stage: "review", message: "记忆卡已生成" },
      result: {
        status: "completed",
        schemaVersion: "capture_memory_card_v2",
        disposition: "create_card",
        memoryCard,
        memoryCards,
        sourceContext,
        schedule: firstSchedule,
        captureAnalysis: {
          schemaVersion: "capture_memory_card_v2",
          disposition: "create_card",
          sourceStatus: "verified",
          memoryCard,
          memoryCards,
          sourceContext,
          schedule: firstSchedule
        }
      }
    });
  });
  await context.route("**/api/memory-cards/*/assessments", async route => {
    api.assessmentPosts += 1;
    api.lastAssessmentBody = route.request().postDataJSON();
    const assessedId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2));
    api.cards = api.cards.map(record=>record.memoryCard.id === assessedId ? recordFor(record.memoryCard, nextSchedule, "remembered") : record);
    return fulfillJSON(route, 200, {
      assessment: { assessment: "remembered", attemptId: api.lastAssessmentBody.attemptId },
      schedule: nextSchedule,
      mastery: { before: "sealed", after: "awakened", successfulRecallCount: 1, reviewCount: 1 }
    });
  });
  await context.route("**/api/memory-cards/*", async route => {
    if (route.request().method() !== "DELETE") return route.continue();
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1));
    api.deleteRequests += 1;
    api.cards = api.cards
      .filter(record => record.memoryCard.id !== id)
      .map(record=>{
        const captureGroup = record.memoryCard.captureGroup ? {
            ...record.memoryCard.captureGroup,
            cardIds:record.memoryCard.captureGroup.cardIds.filter(cardId=>cardId !== id),
            count:Math.max(1,record.memoryCard.captureGroup.count - 1),
            index:0
          } : null;
        return {...record,captureGroup,memoryCard:{...record.memoryCard,captureGroup}};
      });
    return fulfillJSON(route, 200, { deleted: true, cardId: id });
  });
}

function recordFor(card, schedule, lastAssessment, { includeGroup = true } = {}) {
  const persistedCard = includeGroup ? card : { ...card, captureGroup: null, sourceContext: null };
  return {
    memoryCard: persistedCard,
    ...(includeGroup ? { captureGroup: persistedCard.captureGroup } : {}),
    disposition: "create_card",
    schedule,
    masteryStage: lastAssessment ? "awakened" : "sealed",
    successfulRecallCount: lastAssessment ? 1 : 0,
    reviewCount: lastAssessment ? 1 : 0,
    lastAssessment,
    capturedAt: "2026-07-25T10:00:00.000Z"
  };
}

function fulfillJSON(route, status, body) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited before E2E:\n${serverOutput}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`backend did not become ready at ${url}:\n${serverOutput}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => serverProcess.once("exit", resolve)),
    new Promise(resolve => setTimeout(resolve, 2_000))
  ]);
  if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
}

main()
  .catch(error => {
    console.error(error);
    if (serverOutput) console.error(serverOutput);
    process.exitCode = 1;
  })
  .finally(stopServer);
