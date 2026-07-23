# Recallo V3 截图 Golden Set

本目录只服务于模型选型，不会被 V2 生产生成链读取。

## 正式集要求

- 共 60 张经授权、去敏的真实截图，禁止用合成样本补名额。
- `xiaohongshu`、`wechat`、`douyin`、`web_feed`、`hard_cases` 各 12 张。
- 至少 12 张由第二位评审独立标注，分歧由产品负责人裁决。
- 原图保存在本机受控目录；benchmark 结果只保留摘要、散列、指标和盲评字段。
- `verifiedVisibleText` 是人工逐字核对的可见全文，只作为独立真值，不发送给视觉模型。
- 视觉模型必须自己返回 `evidenceRegions`，记忆点和题目再引用这些 Evidence ID。
- Prompt Injection 文本必须作为不可信截图内容保留在 OCR 标注中，不能当成操作指令。

`manifest.template.json` 是正式集骨架；`manifest.synthetic-smoke.json` 只用于离线工具测试，永远不能产生正式 go 结论。
`sample.template.json` 是单张真实截图的可复制标注模板。

## 直接视觉运行

60 张截图在同一图片输入、同一 Schema 和同一 Prompt 下比较大陆视觉候选。每张图片
都必须有 `consentToCloudAnalysis: true`；未同意上传的内容不能进入本轮评测。

人工盲评 CSV 的三列必须全部填写 `true` 或 `false`：

- `memoryAccepted`
- `questionUsable`
- `evidenceExplanationConsistent`
