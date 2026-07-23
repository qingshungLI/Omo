export function createManualReviewCsv(result) {
  const header = [
    "blindId",
    "cohort",
    "difficulty",
    "disposition",
    "memoryStatement",
    "questionType",
    "questionPrompt",
    "answer",
    "citedEvidence",
    "memoryAccepted",
    "questionUsable",
    "evidenceExplanationConsistent",
    "notes"
  ];
  const rows = result.records.map((record) => [
    record.blindId,
    record.cohort,
    record.difficulty,
    record.reviewPreview?.disposition || "",
    record.reviewPreview?.memoryStatement || "",
    record.reviewPreview?.questionType || "",
    record.reviewPreview?.questionPrompt || "",
    record.reviewPreview?.answer || "",
    (record.reviewPreview?.citedEvidence || [])
      .map((item) => `[${item.id}] ${item.text}`)
      .join("\n"),
    "",
    "",
    "",
    ""
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function parseManualReviewCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  for (const required of [
    "blindId",
    "memoryAccepted",
    "questionUsable",
    "evidenceExplanationConsistent"
  ]) {
    if (index[required] === undefined) throw new Error(`人工评审 CSV 缺少列：${required}`);
  }
  return rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, rowIndex) => ({
      blindId: row[index.blindId],
      memoryAccepted: parseBoolean(row[index.memoryAccepted], rowIndex, "memoryAccepted"),
      questionUsable: parseBoolean(row[index.questionUsable], rowIndex, "questionUsable"),
      evidenceExplanationConsistent: parseBoolean(
        row[index.evidenceExplanationConsistent],
        rowIndex,
        "evidenceExplanationConsistent"
      ),
      notes: index.notes === undefined ? "" : row[index.notes]
    }));
}

export function renderModelSelectionReport({
  decision,
  result,
  textResult
}) {
  const benchmarkResult = result || textResult;
  const lines = [
    "# Recallo V3 模型选型报告",
    "",
    `- 生成时间：${decision.generatedAt}`,
    `- Golden Set：${benchmarkResult.datasetId}`,
    `- 数据集达到正式选型要求：${yesNo(benchmarkResult.selectionReadyDataset)}`,
    `- 价格核对日期：${benchmarkResult.pricingCheckedAt || "未记录"}`,
    `- 固定汇率：1 USD = ${benchmarkResult.usdToCny} CNY`,
    `- 结论：${decision.status.toUpperCase()}（${decision.reason}）`,
    "",
    "## 选型结果",
    "",
    `- 产品指定主模型：${decision.preferredPrimaryCandidateId || "未指定，按评测规则自动选择"}`,
    `- 主视觉模型：${decision.primaryCandidateId || "未确定"}`,
    `- 高质量修复模型：${decision.repairCandidateId || "未确定"}`,
    ""
  ];

  if (decision.evidenceIssues.length) {
    lines.push("## 当前阻断项", "");
    for (const item of decision.evidenceIssues) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push(
    "## 直接视觉模型指标",
    "",
    "| 候选 | 完成 | 首次 Schema | 修复后 Schema | 证据 ID | 视觉证据真值 | 关键事实错误 | 记忆点接受 | 题目可用 | P50 / P95 | 每个通过记忆点成本 | 硬门 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|"
  );
  for (const summary of decision.candidateSummaries) {
    const hardGate = summary.hardGatePassed
      ? "通过"
      : `失败：${summary.hardGateFailures.join("、")}`;
    lines.push(
      `| ${summary.candidateId} | ${summary.completedCount}/${summary.recordCount} | ${percent(summary.firstSchemaPassRate)} | ${percent(summary.afterRepairSchemaPassRate)} | ${percent(summary.evidenceIdValidRate)} | ${percent(summary.visualEvidenceValidRate)} | ${percent(summary.unsupportedCriticalTokenRate)} | ${percent(summary.humanMemoryAcceptanceRate)} | ${percent(summary.humanQuestionUsableRate)} | ${duration(summary.latencyP50Ms)} / ${duration(summary.latencyP95Ms)} | ${money(summary.averageAcceptedMemoryCostCny)} | ${hardGate} |`
    );
  }
  lines.push("");

  lines.push(
    "## Go / No-go",
    "",
    decision.status === "go"
      ? "质量与证据条件已满足，可以进入 V3 后端纵切片。"
      : "当前为 NO-GO。不得据此修改 V2 生产生成管线或启动 V3 生产纵切片。",
    ""
  );
  return lines.join("\n");
}

function parseBoolean(value, rowIndex, column) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "y", "是"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "否"].includes(normalized)) return false;
  throw new Error(`人工评审 CSV 第 ${rowIndex + 2} 行 ${column} 必须填写 true/false。`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function duration(value) {
  return Number.isFinite(value) ? `${(value / 1000).toFixed(2)}s` : "—";
}

function money(value) {
  return Number.isFinite(value) ? `¥${value.toFixed(4)}` : "—";
}

function yesNo(value) {
  return value ? "是" : "否";
}
