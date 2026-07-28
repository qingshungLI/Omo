# Omo 文档维护指南

## 信息放在哪里

| 内容 | 位置 | 示例 |
|---|---|---|
| 已实现且相对稳定的事实 | `docs/` | API 合同、布局系统、素材授权、质量边界 |
| 当前主题分支将改变什么、任务与验收 | `plans/<branch-slug>.md` | 重构、迁移、体验改进、质量审计 |
| 所有稳定文档入口 | [[docs/index]] | 分类索引 |
| 当前 checkout 的活跃计划 | [[PLANS]] | 分支、负责人、状态、进度、下一步 |
| 代理工作规则 | [[AGENTS]] | 多 Agent 分工、Plan 循环、工程护栏 |
| 重大且难以逆转的决定 | [[docs/decision-log]] | 合同、迁移、隐私、关键依赖 |

计划是施工期状态，不是完成后的文档层。复杂任务以计划提交开工，阶段中持续更新，验收完成后把稳定事实沉淀到 `docs/`，并在 PR 前退役计划。合入后的过程从 Git 历史取回。

## 双链语法

内部双链以仓库根目录为基准并省略 `.md`：

```text
[[docs/product-principles]]
[[docs/ios-api-data-contract-zh#截图提交与任务轮询当前主链]]
[[docs/frontend/v2-layout-system|V2 布局系统]]
[[plans/README]]
```

`README.md`、`AGENTS.md`、`PLANS.md`、`docs/**/*.md` 和 `plans/**/*.md` 会被 `npm --prefix backend run docs:check` 检查。图片、代码文件和外部网页继续使用标准 Markdown 链接。

临时计划可以在活动期间被稳定文档引用，但退役前必须移除或改写这些反链；长期文档不得指向已删除的计划。

## 稳定文档要求

- 每篇文档只解决一个明确问题，文件名使用小写 kebab-case；已有语言后缀可以保留。
- 新文档必须被 [[docs/index]] 或另一篇已索引文档引用。
- 新文档末尾应有“相关文档”，连接到上游合同和相邻边界。
- 描述当前能力时必须能指向代码、测试、迁移或真实验证证据。
- 计划、未来设想和未实现能力必须明确标记，不得使用已完成口吻。
- Fixture、Mock、静态截图和真实环境验证必须分开描述。
- 不在公开文档写密钥、真实用户数据、内部服务地址、完整模型请求/响应或未授权素材信息。

## 更新触发条件

- 产品定位、证据边界、稀有度含义或召回体验改变：更新 [[docs/product-principles]]。
- API、Schema、兼容字段、失败语义或客户端读取优先级改变：更新 [[docs/ios-api-data-contract-zh]]。
- V2 视图职责、路由、状态或 Fixture 注入边界改变：更新 [[docs/frontend/v2-frontend-architecture]]。
- 页面脚手架、布局 Token 或通用间距规则改变：更新 [[docs/frontend/v2-layout-system]]。
- 素材来源、许可证、哈希、生成或处理方式改变：更新 [[docs/asset-provenance]]。
- 验证命令、真实环境门槛、UI 检查或已知边界改变：更新 [[docs/quality-baseline]]。
- 重大、难以逆转的产品、合同、迁移、隐私或依赖取舍：向 [[docs/decision-log]] 追加记录。
- 复杂的新需求、技术债或跨 Agent 工作：创建临时计划并更新 [[PLANS]]，不要提前把未来行为写入稳定文档。

## 矛盾处理

发现文档与代码、测试或其他文档不一致时：

1. 记录精确路径、字段、版本和复现证据。
2. 按 [[AGENTS#事实优先级]] 确定需要谁确认。
3. 在当前计划中标记阻塞或范围变化。
4. 在同一 PR 修复行为、测试和稳定文档之间的漂移。
5. 如果决定改变了长期方向，追加 [[docs/decision-log]]。

不要只改文字掩盖实现问题，也不要只改实现而保留误导文档。

## 完成定义

复杂工作只有在代码、测试、合同、稳定文档、UI 原则检验和计划验收一致时才算完成。创建 PR 前还必须：

```bash
npm --prefix backend run docs:check
git diff --check
```

Plan 提交与取回方式见 [[plans/README#提交与生命周期]] 和 [[plans/README#从-Git-历史取回计划]]。

## 相关文档

- [[AGENTS]]
- [[docs/index]]
- [[docs/quality-baseline]]
- [[docs/decision-log]]
- [[PLANS]]
- [[plans/README]]
