import assert from "node:assert/strict";
import test from "node:test";

import { createImageFlowJob, getImageFlowJob } from "./imageFlowJobs.js";

test("runs image flow asynchronously and exposes progress", async () => {
  const created = createImageFlowJob(async (update) => {
    update({ stage: "ocr", message: "正在识别", percent: 10 });
    return { status: "completed", review: { summaryCard: { text: "完成" } } };
  });
  assert.equal(created.status, "running");
  await new Promise((resolve) => setImmediate(resolve));
  const completed = getImageFlowJob(created.jobId);
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.progress.percent, 100);
  assert.equal(completed.result.review.summaryCard.text, "完成");
});
