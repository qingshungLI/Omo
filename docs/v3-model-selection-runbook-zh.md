# Recallo V3 直接视觉模型选型手册

状态：评测工具已实现；正式 60 张 Golden Set 与模型密钥未就绪时，结论必须保持 `NO-GO / insufficient_evidence`。

本版本采用“截图直接进入视觉模型”的路线，不使用 Apple Vision，也不把独立 OCR 作为产品主链前置步骤。工具与 V2 生产生成管线隔离，不会建设对象存储、来源搜索、知识图谱或 V3 业务表。

产品已指定 `qwen3.7-plus-2026-05-26` 为主视觉模型，对应候选 ID 为 `qwen3.7-plus-vision`。benchmark 的职责是验证它能否通过质量门，并选择修复/降级模型；指定主模型不合格时必须输出 `NO-GO`，不能静默换成更便宜的候选。

## 1. 单次视觉分析合同

视觉模型一次返回：

- `evidenceRegions`：从截图逐字抄录的关键证据、置信度和归一化坐标；
- 最多一个 `memoryItem`；
- `review` 状态下的一道首题；
- 风险域、时效性、保留意图和警告。

记忆点与题目只能引用本次返回的 Evidence ID。模型不能总结整张截图后再伪造证据；证据文字会与 Golden Set 的人工校正全文独立核验。

确定性质量门会阻断：

- 不存在或重复的 Evidence ID；
- 视觉证据无法在人工校正文本中找到；
- 无证据的数字、日期、人名、英文专名或书名；
- 选择题没有唯一答案；
- 截图中的 Prompt Injection 影响输出；
- 高风险内容中的直接建议、保证或缺少风险提示；
- 低置信度证据直接进入复习。

模型允许一次结构修复，不允许无限重试；结构正确但语义失败时不会用重试掩盖失败。

## 2. 图片隐私边界

直接视觉路线意味着截图必须上传到所选模型供应商。每个视觉样本都必须有：

```json
{
  "image": {
    "path": "/absolute/path/to/deidentified.png",
    "mimeType": "image/png",
    "consentToCloudAnalysis": true
  }
}
```

没有明确同意时客户端与 benchmark 都会拒绝上传。运行记录不保存原图、Base64 或完整原始模型响应，只保存散列、指标、结构化盲评摘要和脱敏证据短句。

## 3. Golden Set

正式清单：

`quality-test-set/v3-capture-analysis/manifest.template.json`

必须填入 60 张真实、授权、脱敏截图：

| Cohort | 数量 |
|---|---:|
| `xiaohongshu` | 12 |
| `wechat` | 12 |
| `douyin` | 12 |
| `web_feed` | 12 |
| `hard_cases` | 12 |

至少 12 张设置 `annotation.reviewerCount: 2`。`verifiedVisibleText` 是人工逐字核对的可见全文，用于评测视觉证据是否忠实，不会发送给视觉模型。合成集只能测试合同，不能产生正式 go 结论。

在 `backend` 目录运行：

```bash
npm run golden:v3:validate -- \
  --manifest ../quality-test-set/v3-capture-analysis/manifest.template.json \
  --selection --images
```

只有 60 张、配额、授权、脱敏、复审和图片路径全部满足时才通过。

## 4. 候选模型

大陆主候选：

- `qwen3-vl-flash`
- `qwen3.6-flash`
- `qwen3.7-plus`

可选外部视觉质量对照：

- `gpt-5.6-terra`

DeepSeek 文本候选仍保留为以后“两阶段抽取后生成”的诊断配置，但不参与当前直接视觉主模型的自动选择。

价格快照核对日期为 2026-07-23，固定汇率默认为 `1 USD = 7.2 CNY`。正式运行当天仍需再次确认账号所在地域、模型可用性与价格。
`qwen3-vl-flash` 按单次输入不超过 32K Token 的中国内地实时调用档记录为输入
¥0.15/百万 Token、输出 ¥1.5/百万 Token；超出该档位时必须按官方阶梯价重算。

## 5. 运行与盲评

预检不会上传或计费：

```bash
npm run benchmark:v3:preflight
```

正式付费执行：

```bash
npm run benchmark:v3 -- \
  --config ../quality-test-set/v3-capture-analysis/benchmark.config.example.json \
  --output ../quality-test-set/results/v3-model-selection/vision-result.json
```

加入外部对照时显式增加 `--control`。执行必须有 DashScope/Qwen Key；外部对照另需 OpenAI Key。

benchmark 会生成：

- `vision-result.json`：质量规则、延迟、Token、成本、错误码、散列和盲评摘要；
- `vision-result.manual-review.csv`：隐藏模型身份，供人工判断记忆点、题目和证据解释。

填完 CSV 后：

```bash
npm run benchmark:v3:finalize -- \
  --result ../quality-test-set/results/v3-model-selection/vision-result.json \
  --manual-review ../quality-test-set/results/v3-model-selection/vision-result.manual-review.csv \
  --output ../quality-test-set/results/v3-model-selection/final-report.md
```

自动选择只考虑中国大陆生产候选：

1. 先淘汰任一硬门槛失败者；
2. 再要求记忆点接受率、题目可用率、证据解释一致率和成本达到目标；
3. 验证产品指定的 `qwen3.7-plus-vision` 是否通过全部门槛；
4. 指定主模型通过后，合格的其他候选中接受率最高者作为高质量修复模型；
5. 指定主模型未通过时保持 `NO-GO`，由产品负责人决定是否调整 Prompt、Schema 或模型版本。

## 6. 进入 V3 后端的停止条件

只有最终报告为：

```text
GO (quality_gate_passed)
```

才开始实现：

`Capture → EvidenceRegion → MemoryItem → Question → ReviewSchedule`

否则保持 V2 不变。若无候选达标，只允许迭代一次 Prompt/Schema；再次失败后再评估拆分“视觉证据抽取”和“记忆点/题目生成”，不强行进入生产。
