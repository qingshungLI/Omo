# Recallo 2.0 截图唤醒 PRD

> 版本：v0.6
>
> 日期：2026-07-25
>
> 状态：产品与工程统一基线
>
> 适用范围：iOS 截图捕获、来源恢复、知识卡生成、记忆召回与个人收藏
>
> 取代：`tasks/prd-ai-knowledge-review-ios.md` 中与截图唤醒、单张抽卡和稀有度冲突的设计；取代本文件 v0.5 中五 Tab 首页、纯刮开揭示和旧稀有度措辞
>
> 当前实施路线图：[`roadmap-recallo-2-10h-mvp-v0.2.md`](./roadmap-recallo-2-10h-mvp-v0.2.md)
>
> 生产化 Backlog：[`roadmap-recallo-2-production-backlog.md`](./roadmap-recallo-2-production-backlog.md)
>
> 动效与素材规格：[`docs/recallo-v06-motion-and-assets.md`](../docs/recallo-v06-motion-and-assets.md)
>
> 素材授权登记：[`docs/asset-provenance.md`](../docs/asset-provenance.md)

## v0.6 变更摘要

相对 v0.5，本版只做以下收敛，来源恢复、大视频边界、捕获合同和删除语义保持不变：

1. 首页收敛为“今日 / 知识库 / 我的”三 Tab；今日不显示卡池预选、单抽 / 连续双入口或 1/10 式回合进度，只提供一个召回入口；每次只处理一张，完成后由用户选择继续或“先收好”。
2. 核心揭示统一为“主动回忆后刮开答案”（界面文案可称“擦开”）：使用 26pt 自由路径笔刷，覆盖网格达到 45% 后完整揭示；首次出现为精确语义遮挡，后续复现为判断 / 选择变式。
3. R / SR / SSR 沿用既有核心潜力定义：R = 局部事实 / 案例 / 操作提示，SR = 连接多个概念 / 可迁移方法，SSR = 能组织多个下游知识点的基础原理；未来图谱只在新证据支持下升阶，不降级。
4. 自评文案统一为“记得 / 模糊 / 忘记”三档克制反馈。
5. `IP1-1.svg` 定位为记忆伙伴，通过待机、转头、翻找、抱卡、注视、回应、思考、打盹和收卡表达当前状态；它不发放奖励，也不催促用户。角色英文名确定前，用户界面只称“记忆伙伴”或“它”，不直接称“毛球”。
6. 锁定 Web 预览动效参数、素材复用优先级、素材白名单（Pow / Kenney / Phosphor）与“无假进度”红线；用户提供并授权的角色参考图可以直接裁切、去背景、调色和组合。
7. 当前模型固定为 `qwen3.7-plus-2026-05-26`；设计、Web、iOS 与后端必须共同遵守同一状态机和证据合同，不将产品能力归因于开发代理。
8. Figma `Pick The Shell`（node `815:1693`）的七个 SVG 按审查映射复用；其中 `IP1-1.svg` 就是 Recallo 官方毛球，固定为 `reuse_as_is`，只允许尺寸、裁切和状态组合。只有其他非毛球宠物层需要替换。
9. 旧 MCQ 唤醒入口退出主链；选择题只作为已经完成首次语义唤醒的后续复现变式，旧入口需迁移或下线。
10. 截图生成合同补充 1–3 张卡的窄例外：默认仍生成一张；只有同一内容中存在 2–3 个语义独立、分别有充分证据且适合单独主动回忆的高信息密度知识点时，才生成 2–3 张。前端始终逐张召回，不把同组卡同时变成一个学习页面。
11. `needs_confirmation` 不再是死胡同：知识库中的待确认片段可以确认 / 编辑核心知识、仅存档或删除；确认只复用已经持久化的识别证据，不重新上传截图、不重跑识别或模型生成。
12. 当前集中迭代只对齐 iOS 前端 UI、角色互动与召回交互；不改后端截图识别、来源恢复和平台 Adapter。

## 0. 本版确认的产品合同

以下结论已经确认，开发和设计不再把它们列为开放问题：

1. **截图是 P0 主入口。** 用户在小红书、抖音、Bilibili、公众号、网页和信息流中截图，经 iOS Share Extension 发送给 Recallo。
2. **直接使用视觉模型理解截图。** P0 不以 Apple Vision OCR 为前置依赖；主模型按当前选型使用 `qwen3.7-plus-2026-05-26`。
3. **默认一份内容生成一个主记忆点，窄例外为 2–3 个独立点。** 系统不把碎片内容扩写成课程、章节或大量题目；只有证据中确实存在语义独立、分别可主动回忆的高信息密度知识点时，才生成 2–3 张正式卡。每张卡首次召回做精确语义遮挡，后续复现使用判断 / 选择变式。
4. **首页只有“今日 / 知识库 / 我的”三 Tab。** 今日是默认落点，只展示一个召回入口；知识库只展示用户真实拥有的卡片与记忆碎片，不伪造知识图谱或关系网络。
5. **一次只召回一张。** 系统可以在后台准备至多 10 张候选，但用户不需要预先选择单张或连续模式。完成当前卡后，界面露出下一张卡边缘，由用户选择“继续召回”或“先收好”。
6. **R / SR / SSR 是核心潜力。** 它表达内容在未来的复用杠杆：R = 局部事实 / 案例 / 操作提示，SR = 连接多个概念 / 可迁移方法，SSR = 能组织多个下游知识点的基础原理。它不表达真伪、来源权威、互联网热度、随机概率或掌握程度；未来知识图谱只在新证据支持下升阶，不降级。
7. **语义擦开是核心唤醒交互。** 用户先尝试重建被遮盖的承重语义，再擦开或点击揭示原句、原截图和解释。
8. **学习和社交分开。** MVP 不做分享挑战、好友排行或创作者关卡生态。
9. **来源恢复必须证据优先。** 无法验证的来源不得自动绑定；系统应生成“记忆碎片”或请用户补充链接。
10. **大视频不得默认完整下载。** 先取元数据、文案和字幕，再做受限音频或时间窗口处理。
11. **星图和知识图谱不进入本轮。** 数据结构保留未来关联能力，但不向用户展示复杂知识网络；知识库只列真实卡片。
12. **抽卡的玩家幻想是“召回并修复自己的记忆”。** 不把第三方随机奖励包装成学习；被召回的卡一定来自用户自己的过去。
13. **稀有度与掌握度是两条轴。** R / SR / SSR 固定表达内容潜力；封存、唤醒、稳固、铭刻表达用户跨时间记住它的程度。
14. **IP1 是情境伙伴。** 奶油白、珊瑚微光、铅笔线和轻颗粒；不复刻原神、炉石等第三方资产，只借鉴揭晓节奏与卡面层级。动作只解释产品状态，不兑换奖励。角色英文名确定前，用户界面使用“记忆伙伴”或“它”。
15. **素材先复用、后生成。** 顺序固定为仓库现有素材、用户提供并授权的素材、已登记开源素材，最后才是缺口生成。Pow `1.0.6`（MIT）、Kenney Particle Pack `1.1`（CC0）和 Phosphor Icons Core `2b75f3a`（MIT）继续保留；MVP 不引入 Lottie / Rive；登记见 `docs/asset-provenance.md`。
16. **反馈保持克制，进度必须真实。** 记得 / 模糊 / 忘记三档克制反馈；全链路不出现假进度条、假百分比和伪造的加载动画。
17. **入口只有一个。** 今日首页不出现卡池预选、单抽 / 连续双入口或 1/10 回合进度；上拖卡叠和“召回一张”按钮是同一动作的手势与无障碍等价入口。
18. **Figma 七组件按映射复用。** 优先复用 `origin/main` 中的 `Pick The Shell.zip` 及其对应 [Pick The Shell](https://www.figma.com/design/MRw7QWzuuAqX6B5KpdqRy9/Pick-The-Shell?node-id=815-1693&p=f) 七个 SVG；`IP1-1.svg` 是官方毛球，分类为 `reuse_as_is`，只做尺寸、裁切和状态组合。其他六项分别映射到收藏夹、展开、上传、题卡组、滑动条和单题卡，详细边界见动效与素材规范；只有其他非毛球宠物层需要替换。文件访问密码不得写入仓库。`image_2.zip` 只进入测试图库，不得进入 App bundle 或正式产品素材。
19. **旧 MCQ 流程迁移 / 下线。** 旧选择题唤醒入口不再从今日页可达；选择题数据仅适配为首次唤醒后的 `choice` 复现任务，历史记录保留但不维持两套并行主链。
20. **待确认只复用既有证据。** 用户可以编辑并确认一条已识别的连续核心知识、仅存档、删除或取消；这些动作不得触发新的截图识别、来源搜索或模型调用。确认仍不通过证据门时，界面保持打开并说明还需补哪一项。

## 1. 产品定义

### 1.1 一句话定义

> Recallo 把用户主动截图保存的高价值知识片段，默认变成一张、必要时变成最多三张可独立召回、主动想起、逐步修复并永久收藏的个人记忆卡。

### 1.2 用户问题

用户不缺内容、收藏、截图和总结工具。真正的断点是：

```text
刷到有价值的内容
→ 截图或收藏
→ 继续浏览
→ 数日后忘记
→ 真正需要表达、判断或行动时，只记得“我好像看过”
```

Recallo 不再尝试帮助用户系统学习整篇文章或整个视频，而是在“内容消费”与“长期可调用记忆”之间补上一层。产品闭环固定为：

```text
用户自己的截图 / 视频内容
→ 默认一张、必要时最多三张独立记忆卡
→ 上拖或点击召回
→ IP1 记忆伙伴每次只翻找并取回其中一张旧内容卡
→ 稀有度在 1800ms 过场末端落定
→ 主动回忆并刮开答案
→ 反馈（记得 / 模糊 / 忘记）
→ 修复结算与真实的下一次复习
```

这个闭环里没有随机奖励、没有社交比较：每一次召回都来自用户自己的内容，每一次反馈都真实改变下一次复习时间。

### 1.3 目标用户

P0 面向 **18–35 岁、长期使用内容平台、愿意自我提升的年轻人**，不只面向学生。

优先用户包括：

- 经常在小红书、抖音、Bilibili、公众号和网页中截图的人；
- 产品、设计、运营、商业、AI、科研等领域的年轻知识工作者；
- 在校学生和刚进入职场、需要持续吸收新观点与方法的人；
- 已经有大量截图或收藏，但很少回看的人；
- 愿意每天花 1–5 分钟回顾自己的内容，而不愿维护复杂笔记系统的人。

### 1.4 非目标用户

- 需要完整课程、考试题库或统一教学进度的人；
- 需要团队知识库、企业文档协作或公开内容社区的人；
- 希望自动保存浏览历史中一切内容的人；
- 只需要图像 OCR、摘要或云相册备份的人。

## 2. 产品原则

1. **最高价值，最低负担。** 默认只留下一个值得未来调用的点；只有语义独立且证据充分时才拆成 2–3 张，绝不按篇幅机械扩卡。
2. **先证据，再生成。** 不能从截图或来源证据中支持的内容不得写成确定事实。
3. **先回忆，再揭示。** 原截图是线索和反馈，不应在用户尝试前直接泄露答案。
4. **游戏感服务于认知动作。** 召回过场制造期待，擦开制造主动重建，卡面成长留下长期结果；不以赌博式概率维持参与。
5. **用户拥有节奏。** 每张完成后的继续、收好、退出、仅存档和删除都由用户决定。
6. **不把“顺滑感”当作掌握。** 自我感觉必须与真实回忆表现共同影响调度。
7. **失败也要有产物。** 来源恢复失败时保留可追溯的记忆碎片，而不是让截图消失。
8. **内部复杂，外部简单。** 用户看到“正在整理”“来源未确认”等明确状态，不看到搜索阶段、模型链和复杂百分比。
9. **反馈克制，动效可降级。** 不用爆闪、连击和夸张庆祝压迫用户；所有动效在 prefers-reduced-motion 下有无动画等价路径。
10. **进度必须真实。** 不展示假进度条、假百分比；等待时只呈现真实阶段或静态说明。

## 3. 核心体验

### 3.1 捕获

主入口：

```text
用户截图
→ 系统分享面板
→ 选择 Recallo
→ 扩展显示“已安全保存，正在整理”
→ 用户返回原平台
```

Share Extension 只承担：

- 接收图片；
- 写入 App Group 中的本地持久化队列；
- 记录捕获时间、文件哈希、来源 App 提示和可获得的 URL；
- 启动后台上传；
- 在本地持久化成功后尽快退出。

它不等待模型生成、来源搜索或视频转写完成。

捕获的最低合同：

```ts
type Capture = {
  id: string
  userId: string
  imageAssetId: string
  imageSha256: string
  capturedAt: string
  sourceAppHint?: "bilibili" | "douyin" | "xiaohongshu" | "wechat" | "browser" | "unknown"
  sharedUrl?: string
  status:
    | "locally_queued"
    | "uploading"
    | "received"
    | "analyzing"
    | "needs_confirmation"
    | "ready"
    | "archived"
    | "failed"
}
```

幂等键为 `userId + imageSha256`。重复发送同一截图时，返回首次持久化的 canonical capture group，包括原有卡片顺序、调度和掌握状态；不得用重试模型输出覆盖或追加卡片。

### 3.2 截图理解

后端把经授权上传的截图发送给视觉模型，要求返回：

- 截图平台与置信度；
- 标题、作者、账号、正文、字幕、水印等可见证据；
- 每项证据的区域 ID；
- 内容类型、时效性和风险域；
- 1–3 个候选核心知识；默认一个，只有彼此语义独立且分别有充分证据时才允许多个；
- 可用于来源搜索的独特短语；
- 是否适合生成正式知识卡。

模型只能引用输入中存在的 `EvidenceRegion.id`。服务端必须验证所有 Evidence ID、数字、日期、人名和答案，不因 JSON 合法而默认业务合法。

### 3.3 来源恢复

来源恢复按证据强弱分层：

1. `exact_context`：分享入口同时提供原始 URL；
2. `verified_match`：平台、作者、标题、独特文本和候选内容形成多项一致证据；
3. `probable_match`：存在强候选，但仍有合理替代来源；
4. `unresolved`：无法找到足够证据；
5. `conflicting`：多个候选相互冲突。

只有 `exact_context` 和 `verified_match` 可以自动绑定来源。`probable_match` 必须由用户确认；其余状态不得展示确定来源。

平台策略：

10 小时 MVP 的现场主链只验收 Bilibili 与抖音；小红书 adapter 继续纳入自动化回归，但不阻塞本轮演示。这个优先级不改变长期的平台覆盖范围。

| 平台 | P0 候选发现 | P0 内容获取 | 自动绑定条件 |
| --- | --- | --- | --- |
| Bilibili | 标题、UP 主、画面文字、平台搜索 | 元数据、简介、平台字幕、受限 ASR | 标题/作者一致且字幕或画面证据匹配 |
| 抖音 | 作者、标题/文案、字幕、水印、TikHub 搜索 | 元数据、文案、可用字幕或受限音频 | 作者/文案一致且截图语义证据匹配 |
| 小红书 | 作者、标题、正文片段、话题、TikHub 搜索 | 元数据、正文、图片/视频可用文本 | 作者/正文或视觉证据一致 |
| 公众号/网页 | 独特文本、标题、作者、搜索 | Readability/现有文章提取器 | 原文出现独特文本且标题/作者不冲突 |
| 未知平台 | 视觉模型提取的独特短语、通用搜索 | 已知 URL 后进入现有提取器 | 至少两类独立证据一致 |

### 3.4 大视频处理边界

视频取源固定采用以下顺序：

```text
元数据与文案
→ 平台字幕 / AI 字幕
→ 已知时间戳附近的音频或帧
→ 受限音频转写
→ 仍不足则生成记忆碎片
```

P0 默认限制：

- 不下载完整视频文件；
- 优先只取音轨，不取视频画面；
- 单次媒体抓取预算默认不超过 30 MB；
- 无字幕时，完整音频转写只适用于时长不超过 15 分钟的内容；
- 超过 15 分钟时，仅在可定位时间戳或服务端支持 Range/分段获取时处理局部窗口；
- 代表性片段最多 3 段、总音频时长不超过 180 秒；
- 无法定位截图片段时，不得声称已理解完整视频；
- 所有阈值必须由配置控制，并在真实样本基准测试后调整。

这套边界优先保证来源忠实、带宽和延迟可控；不能为了生成更多卡而无界下载。

### 3.5 默认一张，证据充分时最多三张

正式截图分析继续使用 `capture_memory_card_2`，通过数组增加多卡能力，不另起不兼容的 Schema：

```ts
type CaptureAnalysis = {
  schemaVersion: "capture_memory_card_2"
  disposition: "create_card" | "archive_only" | "needs_confirmation"
  sourceStatus: "verified" | "partial" | "unconfirmed"
  decisionReason: string
  sourceContext: CaptureSourceContextV1 | null
  memoryCards: MemoryCard[] // create_card 时为 1–3；其他 disposition 为空
  memoryCard: MemoryCard | null // 兼容旧客户端，恒等于 memoryCards[0]
  schedules: ReviewSchedule[]
  schedule: ReviewSchedule | null // 兼容旧客户端，恒等于 schedules[0]
}
```

正式知识卡合同：

```ts
type MemoryCard = {
  id: string
  captureId: string
  version: number
  state: "formal" | "fragment" | "archived" | "deleted"
  sourceEvidenceIds: string[]
  sourceBindingStatus:
    | "exact_context"
    | "verified_match"
    | "probable_match"
    | "unresolved"
    | "conflicting"
  coreKnowledge: string
  recallCue: string
  hiddenSemantic: string
  explanation: string
  sourceExcerpt?: string
  sourceTimestampSeconds?: number
  rarity?: "R" | "SR" | "SSR"
  rarityReason?: string
  rarityConfidence?: number
  rarityRuleVersion?: string
  captureGroup: {
    captureId: string
    cardIds: string[]
    count: number
    index: number // 0-based
  }
  sourceContext: CaptureSourceContextV1
  nextReviewAt?: string
  createdAt: string
  updatedAt: string
}
```

生成规则：

- 通常只生成一张卡；只有存在 2–3 个语义独立、分别可主动回忆且各自绑定充分证据的知识点时才生成多卡；
- “高信息密度”由独立知识关系和证据决定，不由 OCR 字数、视频时长或模型想扩写的篇幅决定；
- 语义重复、只是同一结论换一种说法的候选必须合并；超过三张的输出不允许静默截断，服务端最多修复一次，仍不合格则降级为 `needs_confirmation`；
- `coreKnowledge` 必须是一条可独立理解、未来可调用的完整判断；
- `hiddenSemantic` 必须是承重概念、关系、条件或结论，而不是随机名词；
- 遮盖后剩余文本仍应提供足够线索；
- `explanation` 说明为什么答案成立、何时适用和边界是什么；
- 来源不足、内容仅为情绪/广告、事实无法验证或语义依赖完整上下文时，生成 `fragment`；
- 记忆碎片保留截图、提取文字和待确认原因，不显示 R / SR / SSR；
- 用户补充链接或确认候选后，可以把碎片提升为正式卡，必须产生新版本。

多卡持久化与交互规则：

- 同一 capture group 中每张卡都是独立正式卡，拥有自己的调度、掌握状态、反馈记录和删除生命周期；
- `captureGroup.index` 从 0 开始；`cardIds` 是 canonical 顺序，刷新、数据库返回顺序变化或重复上传都不得改变该顺序；
- 重复截图返回已存在的 canonical group，不重新执行“本次生成了几张”的决策，也不覆盖已经发生的调度和掌握状态；
- 一张卡被反馈或删除时不得连带修改同组兄弟卡；删除后服务端对剩余卡重新返回一致的 `count`、`cardIds` 和 0-based `index`；
- UI 仍然一次只召回一张。卡叠与 `1/N` 只说明它来自同一内容的多个独立记忆点，不形成必须连续完成的回合。

### 3.5.1 待确认片段处理

`needs_confirmation` 记录在知识库中显示为“待确认”，点击后打开确认面板，展示来源状态、已保留内容、待确认原因和最多八条已持久化证据。用户可以：

- 编辑核心知识并确认；核心知识必须是某条已识别证据中的连续片段；
- 选择“仅存档”，把记录变成 `archive_only` 记忆碎片，不进入复习池；
- 删除记录，沿用 `DELETE /api/memory-cards/:id`；
- 取消并关闭面板，不改变服务端状态。

确认与仅存档统一调用：

```text
POST /api/memory-cards/:id/confirmation
```

```json
{
  "action": "confirm",
  "coreKnowledge": "从已识别证据中选取的连续核心知识",
  "hiddenSemantic": "可选的连续遮挡片段",
  "recallCue": "可选的回忆提示",
  "sourceEvidenceId": "可选的证据 ID"
}
```

`action` 为 `archive` 时不要求其他字段。服务端只读取该记录已经持久化的 Evidence；不得重新上传图片、重跑视觉识别、来源搜索或模型生成。

响应处理：

- `status = confirmed`：使用响应中的 canonical `card` 更新列表，正式卡才可进入召回与调度；
- `status = archived`：显示为“已保存碎片”，不得继续显示“待确认”或进入召回池；
- `status = needs_user_input`：确认面板保持打开，展示 `message`、`requiredFields` 和 `evidence`，不得伪造正式卡；
- 删除成功：从本地列表移除；取消：保持原记录不变。

`archive_only` 与 `needs_confirmation` 是两个不同状态：前者已经完成“仅存档”选择，后者仍需要用户决策。非正式记录不得展示 R / SR / SSR。

### 3.5.2 当前截图附近的内容

`sourceContext` 由服务端根据来源 block 和截图焦点确定性构建，不允许模型为“补全脉络”另行改写事实：

```ts
type CaptureSourceContextV1 = {
  schemaVersion: "capture_source_context_1"
  nearbyText: string
  focusBlockIds: string[]
  blocks: Array<{
    id: string
    type?: string
    text: string
    sourceRole?: string
    startSeconds?: number
    endSeconds?: number
  }>
  overview: {
    summary: string
    highlights: string[]
  }
  completeness: "full" | "partial" | "screenshot_only"
}
```

- `focusBlockIds` 只能引用 `blocks[].id`；视频 block 有可用时间定位时保留 `startSeconds` / `endSeconds`；
- 上下文最多 64 个 block、合计 40,000 字符；`nearbyText` 最多 8,000 字符，`overview.summary` 最多 800 字符，`highlights` 最多 3 条；
- `full` 表示当前受限来源范围内获得了完整 overview，`partial` 表示只取得局部来源，`screenshot_only` 表示只有截图证据；三者都不能暗示已理解任意长视频的全部内容；
- 回忆答案揭示前，入口文案使用“查看脉络并揭晓”，点击后必须先走与刮开 / 一键揭示相同的显式揭晓状态，再展示上下文；不得把 `hiddenSemantic`、证据原句或可推断答案的上下文提前放入可读 DOM、VoiceOver 或其他无障碍树；
- 答案已揭示后可直接打开“当前截图附近的内容”，先展示 `overview`，再展示 block，并明确标记 `focusBlockIds` 对应的截图附近片段；
- 缺少 `sourceContext` 时如实显示“内容脉络仍在补全”，不得生成替代段落。

### 3.6 首页信息架构：今日 / 知识库 / 我的

首页只有三个 Tab，没有第四个入口：

| Tab | 内容 | 明确不做 |
| --- | --- | --- |
| 今日 | 默认落点。毛球陪伴、单一召回入口、当前卡与继续 / 收好检查点 | 不要求预选记忆池或回合长度，不堆砌运营位、banner 和任务系统 |
| 知识库 | 用户真实拥有的正式卡与记忆碎片：稀有度、掌握状态、下次复习时间、来源 | 不伪造知识图谱、关系网络或“掌握度云图” |
| 我的 | 真实统计、稀有度反馈入口、数据与隐私、动态效果说明 | 不做社交、成就墙、连续签到 |

知识库的每一行都必须对应一张真实卡片或碎片；在没有图谱能力的版本里，就明确告诉用户“图谱未来才会到来”，而不是渲染一个装饰性假网络。

## 4. 记忆召回、唤醒与入册

### 4.1 玩家幻想与逐张自主推进

核心玩家幻想：

> 我从自己的过去召回一段正在消失的记忆，并通过真正想起它，把它修复成个人收藏中的长期资产。

今日 Tab 不出现单张 / 连续选择器，也不要求用户理解内部记忆池：

1. 用户上拖卡叠，或点击与其等价的唯一“召回一张”按钮；
2. 系统选出当前最值得唤醒的一张；
3. 用户完成主动回忆、揭示和反馈；
4. 检查点露出下一张卡边缘，并提供“继续召回”和“先收好”；
5. 只有用户选择继续时，下一张才进入前景。

系统可以预取至多 10 张不重复候选，保证连续体验流畅，但这只是不可见的性能优化，不形成用户必须完成的十张回合。首页、过场和检查点均不得显示候选池、1/10、剩余张数或单抽 / 连续模式。用户在任何检查点停止都不记失败、不损失奖励，也不出现“还差 N 张”的催促。

### 4.2 调度在后台完成

调度器仍然识别到期卡、长期未出现卡、新卡和预测遗忘风险，但它们不再成为首页可选卡池。选择理由通过卡片完成后的次级信息解释，而不是要求用户在开始前做模式判断。

### 4.3 召回不是随机决定学习内容

调度器先按以下顺序选出应唤醒的卡：

1. 已到期且最近回忆失败；
2. 已到期且长期未出现；
3. 新生成、尚未完成第一次唤醒；
4. 其他到期卡。

在同一到期桶内可以使用受约束的随机打散，避免顺序机械化。稀有度只能作为同等调度优先级下的轻微 tie-breaker，不能让未到期 SSR 挤掉到期 R。

### 4.4 召回过场与卡面信息

开始召回后，界面使用一个可跳过、可打断的短过场，把调度器已经选定的旧内容卡从个人记忆中“取回”。根据“稍慢一点”的最新体验决定，首张完整过场在 1800ms 时完成稀有度落定并进入主动回忆：

```text
上拖卡叠 / 点击等价按钮
→ 0–150ms：入口轻压蓄力，IP1 转头
→ 150–360ms：IP1 靠近文件夹并开始取卡
→ 360–1180ms：卡片升起并由中性毛线光迹环绕，不提前泄露等级
→ 1180–1550ms：进入 settle，卡框、材质与 R / SR / SSR 徽标第一次共同揭晓并落定
→ 1550–1800ms：出现主动回忆提示
```

用户在检查点选择继续后，后续卡使用约 900ms 短过场，只保留 IP1 取卡、卡片升起、停稳与提示，不重复完整光迹仪式。

settle 之前的卡背、轨迹和角色动作保持中性，不显示等级专属颜色、材质、文字或 VoiceOver 值。卡片已经由透明调度器选定，过场不得出现转盘、卡包、概率、保底、付费货币或失败抽取。Reduce Motion 下用 180ms 缩放与淡入直达 settle 后的回忆卡面。

卡面停稳后展示：

- R / SR / SSR 或“记忆碎片”；
- 当前掌握状态；
- 主题和轻量来源线索；
- 遮盖后的核心知识（首次）或判断 / 选择变式（后续复现）；
- 26pt 自由路径刮开区域（界面文案可称“擦开”）；
- “直接揭示”无障碍入口。

稀有度徽标和等级材质只在 settle 出现；首张完整过场与后续短过场都遵守同一揭晓门槛，不增加第二次翻卡或随机揭晓。

### 4.5 语义擦开与复现变式

首次唤醒一张卡时，交互顺序：

```text
看到线索与被精确遮盖的承重语义
→ 尝试在脑中重建
→ 擦开或点击揭示
→ 对照完整表达与来源证据
→ 选择“记得 / 模糊 / 忘记”
→ 获得即时解释和下一次安排
→ 看到卡片被修复并收入个人记忆收藏册
```

后续复现（卡片已完成首次唤醒）时，同一记忆点切换为低负担变式：

- **判断变式**：给出一个关于该记忆点的陈述，用户判断“对 / 不对”；
- **选择变式**：给出少量候选项，用户选出符合记忆的一项。

变式答错不扣分、不降级，只作为调度信号并与自评一起影响下次复习。

实现要求：

- 卡面轻点、自由路径刮开、文字“直接揭示”按钮和 VoiceOver 自定义动作必须进入同一个 `revealed` 状态，完整揭示同一答案并遵守同一防泄露门槛；
- 遮盖区域对应精确语义 span，不是随机覆盖图片；
- 自由路径刮开使用固定 26pt 笔刷；覆盖网格达到 45% 后完整揭示，避免像素残留；
- 键盘 Enter / Space 与文字按钮等价；VoiceOver 在揭示前只读线索和操作提示，揭示后才朗读完整答案；
- Reduce Motion 下取消粒子和强动效，揭示直接淡入；
- 用户自评不得单独决定复习时间；
- 调度同时参考是否先查看提示、揭示用时、变式结果、先前结果和自评；
- 每次失败后立即给出正确内容和简短解释，不以扣分惩罚失败。

### 4.6 修复与入册

每次回忆必须留下可见结果，而不是只增加积分：

- 卡片从遮盖、褪色或缺损状态恢复为完整卡面；
- 显示本次前后的掌握状态变化；
- 显示真实的下一次召回安排，并在知识库中可见；
- 卡片落入仅用户可见的“记忆收藏册”；
- 失败不降级或摧毁卡片，只缩短下一次召回间隔；
- 结果检查点由用户主动进入下一张，不自动连播；
- 检查点只露出下一张卡的真实边缘和材质，不显示概率、保底或近失误暗示；
- 庆祝保持克制：一次短促的毛球反应和入册动效，没有全屏爆炸特效。

召回会话的前端状态机固定为：

```ts
type RecallPresentationPhase =
  | "home"
  | "summoning"
  | "recall"
  | "scratching"
  | "revealed"
  | "assessing"
  | "repairing"
  | "checkpoint"
  | "stowing"
  | "paused"
type MascotSceneState =
  | "idle"
  | "reacting"
  | "turning"
  | "rummaging"
  | "carrying"
  | "watching"
  | "acknowledging"
  | "thinking"
  | "sleeping"
  | "farewell"
type ScenePalette =
  | "creamReady"
  | "mistProcessing"
  | "coralRecall"
  | "lavenderPaused"
  | "sageLibrary"
  | "navyNight"
type ScratchRevealState = {
  paths: ScratchPath[]
  coveredCells: Set<string>
  coverage: number
  isRevealed: boolean
}
type MemoryAssessment = "remembered" | "fuzzy" | "forgot"
type MemoryMasteryStage = "sealed" | "awakened" | "solidified" | "engraved"
type RecallTaskKind = "masked_semantic" | "judgment" | "choice"
```

`MemoryAssessment` 三档对应界面文案“记得 / 模糊 / 忘记”；`assessing` 负责提交反馈与调度信号，`repairing` 负责显示卡面修复、掌握状态和真实下次时间，完成后才进入 `checkpoint`。`RecallTaskKind` 中 `masked_semantic` 只用于首次唤醒，`judgment` / `choice` 用于后续复现。前端持久化当前卡 ID、阶段、刮开覆盖率和已提交反馈标识；恢复时不得重复提交反馈或重新播放完整召回过场。

## 5. R / SR / SSR 核心系统

### 5.1 稀有度的产品语义

稀有度回答：

> 对这个用户而言，这条知识在未来跨场景复用、改变判断或产生行动的潜力有多大？

它不回答：

- 内容是否真实；
- 作者是否权威；
- 观点是否流行；
- AI 是否“喜欢”这条内容；
- 抽中概率有多低；
- 用户是否已经掌握。

来源可信度是正式卡的准入门；遗忘程度由复习状态表达；时效性单独记录。三者不得折叠为稀有度。

### 5.2 等级定义

| 等级 | 定义 | 典型例子 |
| --- | --- | --- |
| R | 局部事实 / 案例 / 操作提示：在一个具体场景中有用、值得保留的知识点 | 一个明确事实、一个案例结论、一个产品操作提示 |
| SR | 连接多个概念 / 可迁移方法：能跨多个相似场景复用的方法、模型或解释 | 可迁移的决策框架、因果机制、通用检查法 |
| SSR | 能组织多个下游知识点的基础原理：能显著改变理解或决策结构、且证据充分的高杠杆知识 | 反直觉但可靠的核心原则、连接多个领域的解释框架 |

R 不是失败或低质量卡。大多数真实截图应当是 R；冷启动时系统保守分级，SSR 必须有清晰理由与高置信度。

### 5.3 计算、反馈与只升不降

模型输出以下价值维度及证据：

- `personal_relevance`：与用户主动截图和历史主题的关系；
- `transfer_breadth`：可迁移到多少类真实场景；
- `explanatory_power`：是否解释机制而非只给结论；
- `decision_leverage`：是否可能改变判断或行动；
- `durability`：是否不会很快因时效过期；
- `novelty_for_user`：相对用户已有卡片是否提供新信息。

服务端沿用既有版本化规则确定性映射为 R / SR / SSR，并按后端实际合同保存单数 `rarityReason` 与 `rarityRuleVersion`；本轮只改揭晓时序与卡面表现，不改判级规则。同一卡版本、相同证据与相同规则版本必须得到相同等级，稀有度计算不包含随机掷点。

用户可反馈：

- “系统低估了它”；
- “系统高估了它”。

反馈会进入下一版稀有度计算，不允许用户把任意卡直接改成 SSR。原因是用户拥有个人价值判断权，但系统仍需维持等级语义和可比较性。用户反馈不是答题成绩，也不直接改变当前复习结果。

**只升不降：** 卡片稀有度一旦确定，未来只能在新证据支持下上调（例如用户持续标记“低估”且复核成立），不随失败次数、时间推移或单次反馈下调。“高估”反馈进入校准记录，用于改进后续新卡的分级，而不回退已有卡的等级。未来知识图谱中的关联增强也只能提升卡片潜力，不能削弱。

### 5.4 掌握状态：封存 → 唤醒 → 稳固 → 铭刻

掌握状态回答：

> 用户是否在不同时间真正把这条内容变成了可调用的记忆？

| 状态 | 含义 | 升级条件 |
| --- | --- | --- |
| 封存 | 已保存，但尚未完成主动回忆 | 新生成或仅存档 |
| 唤醒 | 至少一次完成回忆尝试并看过纠正反馈 | 完成首次唤醒 |
| 稳固 | 在跨时间窗口中成功主动重建 | 后续到期回忆成功 |
| 铭刻 | 在多个间隔窗口中稳定重建 | 多次跨时间成功，且近期无持续失败 |

掌握状态只能由回忆证据推进，不能付费购买，也不能由 R / SR / SSR 推导。失败不会降级，但会调整下次召回时间。

### 5.5 明确禁止

MVP 不包含：

- 付费抽卡、概率池、保底和卡包；
- 重复卡转化货币；
- 稀有度排行榜或好友炫耀；
- 用闪光、震动和倒计时强化无限连续抽取；
- 伪装概率的“神秘卡池”或由稀有度制造错失恐惧；
- 把来源可疑的内容包装成 SSR；
- 用 SSR 数量作为学习成果；
- 假进度条、假百分比或伪造的“正在努力加载”动画；
- 连续签到、每日任务等制造打卡压力的机制。

## 6. 数据、隐私与删除

### 6.1 原截图

原截图默认保留为用户的个人证据和未来回忆线索，但必须满足：

- 私有访问和静态加密；
- 不进入公共训练集、推荐池或运营分析样本；
- 临时处理副本在任务完成或失败超时后删除；
- 明确告知用户截图会发送给 Recallo 后端和第三方模型处理；
- 上线前在供应商合同与隐私政策中确认数据保留和训练使用边界；
- 用户可删除单张截图、卡片或整个账号。

### 6.2 删除语义

删除一张卡时只删除或失效该卡自己的正式版本、复习记录、调度和未完成回合引用；同一 capture group 的其他卡继续存在并保持各自调度。只要仍有兄弟卡，原截图、来源绑定和必要证据就继续由该 capture 持有。

删除整次 capture、删除组内最后一张卡或删除账号时，才一并删除或失效：

- 原截图和衍生缩略图；
- 来源绑定和搜索缓存中的用户关联；
- 该 capture 剩余的证据与后台待处理任务。

备份清除时限必须在正式上线前形成公开 SLA。产品不得显示“已永久删除”而后端仍无限保留。

## 7. 技术纵切片

### 7.1 iOS

```text
Share Extension
→ App Group 文件 + SQLite 捕获记录
→ background URLSession
→ 后端接收确认
→ 主 App 对账并展示处理状态
```

建议用 GRDB 管理 App 与 Share Extension 共享的 SQLite outbox。SwiftUI 卡堆、语义擦开、判断 / 选择变式和三段自评控件保持轻量自研，避免把核心状态交给不支持重排、恢复和删除语义的 UI 依赖。粒子反馈如需引入，只允许评估白名单内的 Pow（MIT，仅 iOS 运行时）；Web 预览不引入 Pow。

### 7.2 后端

```text
POST /v3/captures
→ Postgres 持久化 capture
→ durable job queue
→ vision analysis
→ source resolution
→ bounded source extraction
→ card generation + validation
→ ready / needs_confirmation / fragment
```

当前 `imageFlowJobs.js` 的进程内 `Map` 只能用于 demo，不得承载正式捕获。优先评估 Postgres 原生队列，使任务与现有 Postgres 数据在同一事务边界内持久化；若采用 `pg-boss`，必须先解决 Node engine 与迁移版本约束。

### 7.3 必要实体

- `captures`
- `capture_assets`
- `capture_jobs`
- `evidence_regions`
- `source_candidates`
- `source_bindings`
- `memory_cards`
- `memory_card_versions`
- `draw_sessions`
- `draw_session_items`
- `recall_attempts`
- `review_schedules`
- `rarity_feedback`

所有写接口必须支持幂等键；所有模型产物必须记录 prompt/schema/model 版本，但日志不得保存完整原图、密钥或完整模型响应。

## 8. 范围与优先级

### P0：首个可用纵切片

- iOS Share Extension 与本地持久化 outbox；
- 后台上传和服务端持久化任务；
- Qwen 视觉截图理解；
- Bilibili、抖音、小红书与网页/公众号来源恢复；
- 大视频受限处理；
- 默认一张、语义独立且证据充分时最多三张正式卡 / 记忆碎片；
- 同一 capture group 的卡片独立调度、反馈与删除，以及“当前截图附近的内容”上下文；
- R / SR / SSR 生成、理由和用户高估/低估反馈；
- `needs_confirmation` 的确认 / 编辑、仅存档、删除与取消闭环；确认只复用持久化 Evidence，不重跑识别；
- 今日 / 知识库 / 我的三 Tab 首页；
- 单一召回入口、逐张检查点与继续 / 收好选择；
- 首张在 1800ms 完成稀有度落定、后续约 900ms 的可跳过召回过场和 R / SR / SSR 价值光迹；
- 首次精确语义遮挡的擦开 / 点击揭示，后续判断 / 选择变式；
- 记得 / 模糊 / 忘记三档反馈与简单调度；
- 封存 / 唤醒 / 稳固 / 铭刻状态与个人记忆收藏册入册反馈；
- 毛球情境伙伴状态机与克制动效，prefers-reduced-motion 全链路降级；
- 卡片、截图与账号删除。

### P1：P0 稳定后

- 候选来源人工确认和补链接后的卡片升级；
- 处理完成与定向唤醒通知；
- Shortcut / App Intent 增强入口；
- 真实知识图谱（只升不降）与主题回忆云图；
- 更精细的调度模型。

### P2：本轮不做

- 社交挑战、好友排行和分享战绩；
- 创作者与关卡生态；
- 公开卡牌市场和付费抽卡；
- 用户可见知识图谱或记忆世界（P1 之前）；
- 全量浏览历史自动导入；
- 对任意长视频做无界完整下载与理解；
- Lottie / Rive 动效管线。

## 9. 验收标准

### 9.1 捕获与可靠性

- Share Extension 本地落盘 P95 ≤ 2 秒；
- 扩展显示成功后，压力测试中的捕获丢失数为 0；
- 同一截图重复发送返回首次持久化的 canonical capture group，不生成重复卡、不改变组内顺序，也不覆盖已有调度与掌握状态；
- App、扩展和后台上传被任意终止后可以恢复；
- 后端重启不丢失已确认接收的任务。

### 9.2 来源与生成

- 自动绑定来源的错误率 ≤ 1%，目标为 0；
- 每个事实、数字、人名和答案都能映射到 Evidence ID；
- 无证据确定性表述被服务端阻断；
- 默认一份内容进入一张正式卡；只有 2–3 个候选语义独立、分别可主动回忆且各自证据充分时，才进入 2–3 张；
- 任何正式卡都携带合法 Evidence ID；同组候选如果语义重复必须合并，模型输出超过三张时不得静默截断；
- 每张持久化卡都返回 0-based `captureGroup.index` 和 canonical `cardIds`，并拥有独立调度、反馈与删除语义；
- `sourceContext` 符合 `capture_source_context_1`，所有 `focusBlockIds` 均引用存在的 block，block / 字符上限和 `completeness` 如实生效；
- 正式卡人工可直接接受率 ≥ 85%；
- 不适合生成的内容稳定进入记忆碎片，而不是伪造知识点。

### 9.3 交互与学习

- 首页只有今日 / 知识库 / 我的三 Tab；今日只有一个召回入口，不出现卡池预选、单抽 / 连续双入口、1/10 或剩余张数；上拖与按钮触发同一状态转换；
- 知识库每一行都能对应一张真实卡片或碎片，无任何伪造图谱元素；
- 每张卡完成后露出下一张边缘，并由用户选择继续召回或先收好；
- 同一内容生成多卡时仍逐张召回；卡叠和 `1/N` 不自动连播，也不要求用户一次完成整组；
- 用户停止不记失败，也不出现剩余数量或损失暗示；
- 同一使用会话优先不重复卡版本；
- 首张在 1800ms 完成稀有度落定并进入主动回忆，后续卡过场约 900ms；二者均可跳过、可打断，倾斜不超过 ±4°；
- 首次唤醒为精确语义遮挡，擦开、点击揭示、VoiceOver 和 Reduce Motion 均可完成闭环；
- 卡面轻点、自由路径刮开、文字按钮和 VoiceOver 自定义动作进入同一 `revealed` 状态；揭示前无障碍树不泄露答案；
- 用户在答案揭示前打开来源上下文时，必须通过“查看脉络并揭晓”显式触发同一揭晓状态；揭示前可读 DOM 和无障碍树中不存在答案文本；
- 自由路径刮开使用固定 26pt 笔刷，并以网格覆盖率达到 45% 后完整揭示；
- 后续复现使用判断 / 选择变式，答错无惩罚；
- 反馈只有记得 / 模糊 / 忘记三档，无夸张庆祝；
- 取卡 / 回忆 / 反馈 / 收卡分别使用 `turning → rummaging → carrying` / `watching` / `acknowledging | thinking` / `farewell`；本轮不新增角色专名；
- 中途退出后恢复同一卡片、稳定阶段、刮开进度和反馈状态，不重复提交结果；
- 待确认片段可确认 / 编辑、仅存档、删除或取消；确认失败保持面板打开，整个路径不重跑识别；
- 全链路无假进度条与假百分比；
- R / SR / SSR 在卡面可见，且不改变硬性到期优先级；
- 用户不会把 R / SR / SSR 与封存 / 唤醒 / 稳固 / 铭刻混淆；
- 每次完成后可以看到卡片修复、状态变化、真实的下次安排和入册结果；
- 自评、变式结果与客观回忆信号都进入调度记录。

### 9.4 护栏

- 不出现概率、付费、保底、货币、排行榜、连续签到；
- 不将“抽到 SSR”当作学习完成；
- 不把 `probable_match` 展示为确定来源；
- 超出媒体预算时可降级，不发生无界完整视频下载；
- 不导入许可证不明素材；不宣称使用未实际导入的素材；用户授权素材与项目原创、第三方素材分别登记；
- 删除组内单卡不会删除兄弟卡或重置其调度；删除最后一张卡、整次 capture 或账号后，前台、任务队列与业务数据库不再可访问该捕获资产。

### 9.5 视觉来源与旧流程迁移

- 优先复用 `origin/main` 中的 `Pick The Shell.zip` 及其对应 [Pick The Shell](https://www.figma.com/design/MRw7QWzuuAqX6B5KpdqRy9/Pick-The-Shell?node-id=815-1693&p=f) 七个 SVG；逐项映射、处理分类和使用位置见 `docs/recallo-v06-motion-and-assets.md`，实际导入项仍须进入素材登记。
- `image_2.zip` 只作为 Bilibili / 抖音等输入流程的测试图库；不得导入 App bundle、卡面装饰、开屏或任何正式产品素材。
- `Pick The Shell/IP1-1.svg` 就是开屏及首页、等待、召回、回忆、反馈、空状态、结束页统一使用的官方毛球，按 `reuse_as_is` 处理，只允许尺寸、裁切和状态组合；组件库中其他非毛球宠物或临时占位动物必须替换。
- 旧 MCQ 唤醒入口在正式构建中不可达；历史选择题只在首次语义唤醒完成后适配为 `choice` 复现任务。旧页面完成数据迁移与回归后下线，不以隐藏入口维持第二条主链。
- 验收测试必须明确拒绝旧文案与状态：卡池选择、单抽 / 连续选择、1/10 进度、抽中概率和“下一题”式自动连播。

## 10. 产品验证指标

核心结果不是召回按钮点击次数，而是跨时间的有效唤醒：

- **捕获到首次唤醒转化率**：截图后 7 天内至少完成一次主动重建；
- **跨时段二次唤醒率**：首次唤醒后，后续窗口再次完成有效回忆；
- **纠偏恢复率**：首次“忘记”的卡，在后续窗口成功重建；
- **真实调用证据**：用户主动标记“在工作、学习或交流中用到了”。

诊断指标：

- 唯一召回入口的开始转化率；
- 每张完成后的继续率、主动收好位置和单次会话完成张数；
- 首次遮挡与判断 / 选择变式的完成率、答错率；
- 各稀有度的回忆成功率与用户高估/低估反馈；
- 各掌握状态的推进率、收藏册重访率和二次召回率；
- 召回过场跳过率，以及稀有度与掌握状态的误解率；
- 记忆碎片比例、来源确认率和提升为正式卡比例；
- 单卡模型成本、P50/P95 生成延迟和失败类型。

不得把以下指标单独当作产品成功：

- 总截图数；
- 总卡片数；
- 总擦开次数；
- SSR 数量；
- 一次完成十张的比例；
- 连续签到天数。

## 11. 仍需通过实验决定的问题

以下不是方向性争论，而是 P0 实验参数：

- 下一张卡边缘的可见程度与“继续 / 收好”文案；
- 首页空状态与今日已完成状态的毛球姿态；
- 暂停状态是否允许跨天继续；
- R / SR / SSR 的初始阈值与冷启动置信度；
- 语义擦开覆盖阈值、判断 / 选择变式的题面生成质量；
- 自评信号、变式结果与真实回忆表现的调度权重；
- 各平台媒体抓取的最终字节、时长和时间窗口阈值；
- 原截图长期保留策略与备份清除 SLA。

## 12. 视觉与交互参考

- [`recallo-v06-motion-and-assets.md`](../docs/recallo-v06-motion-and-assets.md)：v0.6 动效时间轴、状态机、Reduce Motion 降级、毛球姿态、反赌博 / 无社交边界与素材授权策略。
- [Agent UI Atlas](https://github.com/starvingarc/agent-ui-atlas)：只用于检索 Kawaii Minimal、Hand-Drawn Doodle、Soft UI 与克制动效案例；Atlas 的整理许可不替代链接素材各自的许可证。
- [Pick The Shell（node 815:1693）](https://www.figma.com/design/MRw7QWzuuAqX6B5KpdqRy9/Pick-The-Shell?node-id=815-1693&p=f)：用户授权按七组件映射复用；`IP1-1.svg` 是官方毛球并按 `reuse_as_is` 处理，其他非毛球宠物层才需要替换。
- [`asset-provenance.md`](../docs/asset-provenance.md)：仓库素材授权登记，区分实际使用与评估中。
- [`ios-app-demo.html`](../docs/ios-app-demo.html)：v0.6 三 Tab 首页、召回、语义擦开与反馈的 Web 交互预览。
- [`recallo-v06-web-home.png`](../docs/product-exploration/assets/recallo-v06-web-home.png)：375px 今日页验收截图。
- [`recallo-v06-web-recall.png`](../docs/product-exploration/assets/recallo-v06-web-recall.png)：首次精确语义遮挡验收截图。
- [`recallo-v06-web-library.png`](../docs/product-exploration/assets/recallo-v06-web-library.png)：只展示真实卡片和调度日期的知识库验收截图。
- [`2026-07-24-recallo-v06-mvp-validation.md`](../docs/validation/2026-07-24-recallo-v06-mvp-validation.md)：服务器、Web 和 iOS 环境边界的验收记录。
- [`recallo-memory-summon-concept-v0.5.png`](../docs/product-exploration/assets/recallo-memory-summon-concept-v0.5.png)：v0.5 历史概念图，首页结构已被本版三 Tab 取代，仅保留布局质感参考。
- [`recallo-web-memory-collection-v0.5.png`](../docs/product-exploration/assets/recallo-web-memory-collection-v0.5.png)：v0.5 Web 实现的“主动回忆后修复并入册”验收截图，交互细节以 v0.6 文档与 demo 为准。

## 13. 研究参考

- Apple, [App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups/)
- Apple, [App Extension Programming Guide: Handling Common Scenarios](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html)
- Apple, [Share Extension](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html)
- Apple, [`URLSessionConfiguration.sharedContainerIdentifier`](https://developer.apple.com/documentation/Foundation/URLSessionConfiguration/sharedContainerIdentifier)
- Balci & Morris (2026), badges may reduce intrinsic motivation while freedom of choice supports autonomy, [DOI: 10.1002/jcal.70234](https://doi.org/10.1002/jcal.70234)
- Kurnaz & Koçtürk (2025), educational gamification motivation meta-analysis with substantial heterogeneity, [DOI: 10.1002/pits.70056](https://doi.org/10.1002/pits.70056)
- Cranney et al. (2009), retrieval practice and corrective feedback, [DOI: 10.1002/acp.1630](https://doi.org/10.1002/acp.1630)
- Candel et al. (2020), formative feedback and confidence calibration, [DOI: 10.1111/jcal.12439](https://doi.org/10.1111/jcal.12439)
