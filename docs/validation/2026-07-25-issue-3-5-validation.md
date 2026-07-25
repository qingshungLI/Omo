# Recallo Issue #3 / #5 合同与自动化验证

> 日期：2026-07-25
>
> 服务器基线：`bridge-amax:/data1/yuxiao/recallo-docs-issue35`
>
> 被验证提交：`106eac065fb9d2c613a2b0a49f5018ef9dc56cd8`
>
> 状态：合同和服务器自动化门通过；真实 API、浏览器端到端、Postgres 实例、Xcode 与 Simulator 仍为 pending

## 1. 本次范围

本报告只核对：

- Issue #3：默认一张卡，高信息密度且语义独立、证据充分时生成 2–3 张；
- Issue #5：补充模型输出兼容字段、canonical capture group，以及“当前截图附近的内容”；
- 同组卡仍逐张召回，独立调度、反馈和删除；
- 旧客户端继续读取首卡 `memoryCard` / `schedule`。

本次没有新增知识图谱、社交、创作者生态、付费抽卡或平台 Adapter，也没有以这些能力作为 Issue #3/#5 的完成依据。

## 2. 冻结合同

### 2.1 多卡边界

- 正式 Schema 仍为 `capture_memory_card_2`；
- `create_card` 返回 `memoryCards` 1–3 张，默认一张；
- 只有候选语义独立、各自可主动回忆且分别绑定充分 Evidence ID 时才允许 2–3 张；
- `archive_only` / `needs_confirmation` 返回空数组和空首卡；
- `memoryCard = memoryCards[0]`、`schedule = schedules[0]`，用于旧客户端兼容；
- 超过三张、语义重复、Evidence ID 无效、遮挡不精确或答案不唯一时，服务端最多修复一次，不允许客户端静默截断。

### 2.2 持久化分组

每张持久化卡都返回：

```json
{
  "captureGroup": {
    "captureId": "capture-1",
    "cardIds": ["card-a", "card-b"],
    "count": 2,
    "index": 0
  }
}
```

`index` 为 0-based，`cardIds` 为 canonical 顺序。重复截图返回首次持久化的完整 group，不覆盖原卡、调度或掌握状态。单卡 Assessment 和 DELETE 不影响同组兄弟卡。

### 2.3 来源上下文

正式 `sourceContext` 为：

```json
{
  "schemaVersion": "capture_source_context_1",
  "nearbyText": "截图附近的来源原文",
  "focusBlockIds": ["block-2"],
  "blocks": [
    {
      "id": "block-2",
      "type": "subtitle",
      "text": "截图附近的来源原文",
      "sourceRole": "focus",
      "startSeconds": 18.5,
      "endSeconds": 31
    }
  ],
  "overview": {
    "summary": "来源脉络",
    "highlights": ["要点一"]
  },
  "completeness": "full"
}
```

上下文由来源 block 和截图焦点确定性构建。揭示前入口为“查看脉络并揭晓”，必须先进入与刮开 / 一键揭示相同的 reveal 状态；揭示前不允许在可读 DOM 或无障碍树中泄露答案。

## 3. 已执行的服务器验证

### 3.1 后端完整测试

命令：

```bash
cd /data1/yuxiao/recallo-docs-issue35/backend
/data1/yuxiao/recallo/.envs/runtime/bin/node scripts/check-source.mjs --tests-only
```

结果：

```text
tests 402
pass 402
fail 0
cancelled 0
skipped 0
todo 0
```

该完整测试包含并通过以下与 Issue #3/#5 直接相关的场景：

- 生成 1–3 张语义独立卡，并保持首卡兼容镜像；
- 拒绝跨卡语义重复和全局重复的 recall variant ID；
- 四张输出不被静默截断，质量失败最多修复一次；
- `sourceContext` 确定性生成，截图附近 focus block 与全文 overview 分离；
- 内存仓库中兄弟卡独立调度、反馈与删除；
- 重复截图返回已有 canonical group，不覆盖已发生的调度和掌握状态；
- Postgres 序列化根据持久化 ordinal 恢复稳定的 0-based 分组顺序；
- image-flow 持久化响应同时返回 `memoryCards` / `schedules` 与单数兼容字段。

说明：隔离 worktree 运行时临时引用服务器已有的 backend 依赖目录，测试结束后已移除该未跟踪符号链接；没有将依赖或代码变化写入文档提交。

### 3.2 V2 UI 静态回归守卫

命令：

```bash
cd /data1/yuxiao/recallo-docs-issue35
/data1/yuxiao/recallo/.envs/runtime/bin/node tools/v2-ui-regression-guard.mjs
```

结果：`46 / 46 PASS`。

与本次范围直接相关的守卫包括：

- Web 接受 `memoryCards`，按 `captureGroup.cardIds` / 0-based `index` 恢复组，并保留单卡回退；
- Web 规范化 `overview`、`completeness`、时间戳和最多 64 个来源 block；
- 上下文入口显式揭示、对话框关闭后恢复焦点；
- 显式揭示前 `hiddenSemantic` 不作为可读 DOM 文本；
- iOS / Web 仍一次只显示一张卡，召回节奏和既有刮开合同未被多卡破坏。

静态守卫只能证明冻结的代码模式仍在，不能替代真实浏览器、VoiceOver 或 Simulator 操作。

## 4. 证据结论

| 验证项 | 当前结论 | 证据等级 |
| --- | --- | --- |
| 1–3 张生成及质量阻断 | 通过 | Node 自动化 |
| canonical group 与 0-based index | 通过 | Node 自动化 |
| 重复截图保留已有 group / schedule / mastery | 通过 | Node 自动化 |
| 单卡独立反馈与删除 | 通过 | Node 自动化 |
| `capture_source_context_1` 构建与持久化 | 通过 | Node 自动化 |
| Web / iOS 冻结字段和防提前泄露代码模式 | 通过 | 静态 UI 回归守卫 |
| Web 鼠标、触摸、键盘真实交互 | pending | 尚未执行浏览器端到端 |
| Bilibili / 抖音真实 Qwen + TikHub | pending | 尚未执行 live API |
| 真实 Postgres 实例重启与并发恢复 | pending | 当前仅有仓库自动化 |
| Xcode 编译与 Swift 单元测试 | pending | 尚未执行 Apple 工具链 |
| Simulator 召回、刮开、上下文和恢复 | pending | 尚未执行 |
| VoiceOver、Dynamic Type、Reduce Motion 实机 / Simulator | pending | 尚未执行 |

## 5. Go / no-go

- **可以继续进入后续端到端验收**：Issue #3/#5 的数据合同和服务器自动化门已经通过。
- **不能据此宣称功能完整上线**：live API、真实浏览器、真实 Postgres、Xcode、Simulator 和无障碍证据尚未完成。
- **Issue 关闭保持 pending**：待集成分支完成上述必要验收并由负责人确认后再关闭；本次文档提交不自动修改 GitHub Issue 状态。
