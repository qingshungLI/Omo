# Recallo 2.0 截图唤醒 PRD

> 版本：v0.4
>
> 日期：2026-07-24
>
> 状态：产品与工程统一基线
>
> 适用范围：iOS 截图捕获、来源恢复、知识卡生成、抽卡唤醒
>
> 取代：`tasks/prd-ai-knowledge-review-ios.md` 中与截图唤醒、单张抽卡和稀有度冲突的设计
>
> 当前实施路线图：[`roadmap-recallo-2-10h-mvp-v0.2.md`](./roadmap-recallo-2-10h-mvp-v0.2.md)
>
> 生产化 Backlog：[`roadmap-recallo-2-production-backlog.md`](./roadmap-recallo-2-production-backlog.md)

## 0. 本版确认的产品合同

以下结论已经确认，开发和设计不再把它们列为开放问题：

1. **截图是 P0 主入口。** 用户在小红书、抖音、Bilibili、公众号、网页和信息流中截图，经 iOS Share Extension 发送给 Recallo。
2. **直接使用视觉模型理解截图。** P0 不以 Apple Vision OCR 为前置依赖；主模型按当前选型使用 `qwen3.7-plus-2026-05-26`。
3. **一张截图只生成一个最高价值记忆点。** 系统不把碎片内容扩写成课程、章节或大量题目。
4. **单张与连续抽取都是正式能力。** 用户可选“抽 1 张”或“连续抽取”；连续模式至多 10 张，任何一张之后都可退出。
5. **R / SR / SSR 是核心能力。** 它表达个人知识价值与复用杠杆，不表达真伪、来源权威、互联网热度或付费概率。
6. **语义刮开是核心唤醒交互。** 用户先尝试重建被遮盖的承重语义，再揭示原句、原截图和解释。
7. **学习和社交分开。** MVP 不做分享挑战、好友排行或创作者关卡生态。
8. **来源恢复必须证据优先。** 无法验证的来源不得自动绑定；系统应生成“记忆碎片”或请用户补充链接。
9. **大视频不得默认完整下载。** 先取元数据、文案和字幕，再做受限音频或时间窗口处理。
10. **星图和知识图谱不进入本轮。** 数据结构保留未来关联能力，但不向用户展示复杂知识网络。

## 1. 产品定义

### 1.1 一句话定义

> Recallo 把用户主动截图保存的一个高价值知识片段，变成未来可以轻量抽取、主动想起并再次理解的一张个人知识卡。

### 1.2 用户问题

用户不缺内容、收藏、截图和总结工具。真正的断点是：

```text
刷到有价值的内容
→ 截图或收藏
→ 继续浏览
→ 数日后忘记
→ 真正需要表达、判断或行动时，只记得“我好像看过”
```

Recallo 不再尝试帮助用户系统学习整篇文章或整个视频，而是在“内容消费”与“长期可调用记忆”之间补上一层：

```text
快速捕获
→ 恢复语境
→ 提炼一个记忆点
→ 在合适时机唤醒
→ 主动重建
→ 揭示反馈
→ 未来再次出现
```

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

1. **最高价值，最低负担。** 一张截图只留下一个值得未来调用的点。
2. **先证据，再生成。** 不能从截图或来源证据中支持的内容不得写成确定事实。
3. **先回忆，再揭示。** 原截图是线索和反馈，不应在用户尝试前直接泄露答案。
4. **游戏感服务于认知动作。** 抽卡制造期待，刮开制造主动重建；不以赌博式概率维持参与。
5. **用户拥有节奏。** 单张、连续、退出、仅存档和删除都由用户决定。
6. **不把“顺滑感”当作掌握。** 自我感觉必须与真实回忆表现共同影响调度。
7. **失败也要有产物。** 来源恢复失败时保留可追溯的记忆碎片，而不是让截图消失。
8. **内部复杂，外部简单。** 用户看到“正在整理”“来源未确认”等明确状态，不看到搜索阶段、模型链和复杂百分比。

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

幂等键为 `userId + imageSha256`。重复发送同一截图时，默认指向已有捕获，不生成重复卡。

### 3.2 截图理解

后端把经授权上传的截图发送给视觉模型，要求返回：

- 截图平台与置信度；
- 标题、作者、账号、正文、字幕、水印等可见证据；
- 每项证据的区域 ID；
- 内容类型、时效性和风险域；
- 一个候选核心知识；
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

这套边界优先保证来源忠实、带宽和延迟可控；不能为了“生成一张卡”而无界下载。

### 3.5 一张截图，一张卡

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
  rarityConfidence?: number
  rarityReasons?: string[]
  rarityVersion?: string
  nextReviewAt?: string
  createdAt: string
  updatedAt: string
}
```

生成规则：

- `coreKnowledge` 必须是一条可独立理解、未来可调用的完整判断；
- `hiddenSemantic` 必须是承重概念、关系、条件或结论，而不是随机名词；
- 遮盖后剩余文本仍应提供足够线索；
- `explanation` 说明为什么答案成立、何时适用和边界是什么；
- 来源不足、内容仅为情绪/广告、事实无法验证或语义依赖完整上下文时，生成 `fragment`；
- 记忆碎片保留截图、提取文字和待确认原因，不显示 R / SR / SSR；
- 用户补充链接或确认候选后，可以把碎片提升为正式卡，必须产生新版本。

## 4. 抽卡与唤醒

### 4.1 两种可选模式

首页同时提供：

- **抽 1 张**：完成一张即可结束；
- **连续抽取**：建立至多 10 张的回合，用户可在任何一张之后结束。

首次使用默认聚焦“抽 1 张”，但不隐藏连续模式。用户的最近选择可在设备端保存，下次仍可切换。

两种模式共享同一个调度器和候选卡池：

- 连续模式没有更高稀有度概率；
- 两种模式没有价格、体力或货币差异；
- 同一回合不重复出现同一卡版本；
- 回合开始时锁定卡 ID 与版本，删除或失效卡应安全跳过；
- 用户退出连续模式不记失败、不损失奖励，也不制造“还差几张”的惩罚；
- 未完成回合可以继续，也可以主动丢弃。

### 4.2 抽取不是随机决定学习内容

调度器先按以下顺序选出应唤醒的卡：

1. 已到期且最近回忆失败；
2. 已到期且长期未出现；
3. 新生成、尚未完成第一次唤醒；
4. 其他到期卡。

在同一到期桶内可以使用受约束的随机打散，避免顺序机械化。稀有度只能作为同等调度优先级下的轻微 tie-breaker，不能让未到期 SSR 挤掉到期 R。

### 4.3 卡面信息

抽取后直接展示：

- R / SR / SSR 或“记忆碎片”；
- 主题和轻量来源线索；
- 遮盖后的核心知识；
- 刮开区域；
- “直接揭示”无障碍入口。

稀有度不是额外翻卡揭晓步骤，避免为等级制造重复刺激。

### 4.4 语义刮开

交互顺序：

```text
看到线索与被遮盖语义
→ 尝试在脑中重建
→ 刮开或直接揭示
→ 对照完整表达与来源证据
→ 选择“想起来了 / 有点印象 / 没想起来”
→ 获得即时解释和下一次安排
```

实现要求：

- 遮盖区域对应精确语义 span，不是随机覆盖图片；
- 刮开达到确定覆盖阈值后完整揭示，避免像素残留；
- VoiceOver 用户可点击揭示并听取完整答案；
- Reduce Motion 下取消粒子和强动效；
- 用户自评不得单独决定复习时间；
- 调度同时参考是否先查看提示、揭示用时、先前结果和自评；
- 每次失败后立即给出正确内容和简短解释，不以扣分惩罚失败。

## 5. R / SR / SSR 核心系统

### 5.1 稀有度的产品语义

稀有度回答：

> 对这个用户而言，这条知识在未来跨场景复用、改变判断或产生行动的杠杆有多大？

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
| R | 在一个具体场景中有用、值得保留的知识点 | 一个产品操作方法、一个明确事实、一个局部技巧 |
| SR | 可跨多个相似场景复用的方法、模型或解释 | 可迁移的决策框架、因果机制、通用检查法 |
| SSR | 能显著改变理解或决策结构、且证据充分的高杠杆知识 | 反直觉但可靠的核心原则、连接多个领域的解释框架 |

R 不是失败或低质量卡。大多数真实截图应当是 R；冷启动时系统保守分级，SSR 必须有清晰理由与高置信度。

### 5.3 计算与反馈

模型输出以下价值维度及证据：

- `personal_relevance`：与用户主动截图和历史主题的关系；
- `transfer_breadth`：可迁移到多少类真实场景；
- `explanatory_power`：是否解释机制而非只给结论；
- `decision_leverage`：是否可能改变判断或行动；
- `durability`：是否不会很快因时效过期；
- `novelty_for_user`：相对用户已有卡片是否提供新信息。

服务端根据版本化规则映射为 R / SR / SSR，并保存 `rarityReasons` 与 `rarityConfidence`。

用户可反馈：

- “系统低估了它”；
- “系统高估了它”。

反馈会进入下一版稀有度计算，不允许用户把任意卡直接改成 SSR。原因是用户拥有个人价值判断权，但系统仍需维持等级语义和可比较性。用户反馈不是答题成绩，也不直接改变当前复习结果。

### 5.4 明确禁止

MVP 不包含：

- 付费抽卡、概率池、保底和卡包；
- 重复卡转化货币；
- 稀有度排行榜或好友炫耀；
- 用闪光、震动和倒计时强化无限连续抽取；
- 把来源可疑的内容包装成 SSR；
- 用 SSR 数量作为学习成果。

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

删除一张卡时一并删除或失效：

- 正式卡和所有版本；
- 复习记录与未完成回合引用；
- 原截图和衍生缩略图；
- 来源绑定和搜索缓存中的用户关联；
- 后台待处理任务。

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

建议用 GRDB 管理 App 与 Share Extension 共享的 SQLite outbox。SwiftUI 卡堆、语义刮开和三段自评控件保持轻量自研，避免把核心状态交给不支持重排、恢复和删除语义的 UI 依赖。

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
- 正式卡 / 记忆碎片；
- R / SR / SSR 生成、理由和用户高估/低估反馈；
- 单张与连续抽取两种模式；
- 语义刮开、揭示、自评和简单调度；
- 卡片、截图与账号删除。

### P1：P0 稳定后

- 候选来源人工确认和补链接后的卡片升级；
- 处理完成与定向唤醒通知；
- Shortcut / App Intent 增强入口；
- 主题回忆云图；
- 更精细的调度模型。

### P2：本轮不做

- 社交挑战、好友排行和分享战绩；
- 创作者与关卡生态；
- 公开卡牌市场和付费抽卡；
- 用户可见知识图谱或记忆世界；
- 全量浏览历史自动导入；
- 对任意长视频做无界完整下载与理解。

## 9. 验收标准

### 9.1 捕获与可靠性

- Share Extension 本地落盘 P95 ≤ 2 秒；
- 扩展显示成功后，压力测试中的捕获丢失数为 0；
- 同一截图重复发送不产生重复正式卡；
- App、扩展和后台上传被任意终止后可以恢复；
- 后端重启不丢失已确认接收的任务。

### 9.2 来源与生成

- 自动绑定来源的错误率 ≤ 1%，目标为 0；
- 每个事实、数字、人名和答案都能映射到 Evidence ID；
- 无证据确定性表述被服务端阻断；
- 一张截图最多进入一张正式卡；
- 正式卡人工可直接接受率 ≥ 85%；
- 不适合生成的内容稳定进入记忆碎片，而不是伪造知识点。

### 9.3 交互与学习

- 用户可在首页明确选择单张或连续模式；
- 连续模式任意一张后都能无惩罚退出；
- 同一回合不重复卡版本；
- 刮开、直接揭示、VoiceOver 和 Reduce Motion 均可完成闭环；
- R / SR / SSR 在卡面可见，且不改变硬性到期优先级；
- 自评与客观回忆信号都进入调度记录。

### 9.4 护栏

- 不出现概率、付费、保底、货币、排行榜；
- 不将“抽到 SSR”当作学习完成；
- 不把 `probable_match` 展示为确定来源；
- 超出媒体预算时可降级，不发生无界完整视频下载；
- 用户删除后，前台、任务队列与业务数据库不再可访问相关资产。

## 10. 产品验证指标

核心结果不是抽卡次数，而是跨时间的有效唤醒：

- **捕获到首次唤醒转化率**：截图后 7 天内至少完成一次主动重建；
- **跨时段二次唤醒率**：首次唤醒后，后续窗口再次完成有效回忆；
- **纠偏恢复率**：首次“没想起来”的卡，在后续窗口成功重建；
- **真实调用证据**：用户主动标记“在工作、学习或交流中用到了”。

诊断指标：

- 单张 / 连续模式选择比例；
- 连续模式平均完成张数和主动退出位置；
- 各稀有度的回忆成功率与用户高估/低估反馈；
- 记忆碎片比例、来源确认率和提升为正式卡比例；
- 单卡模型成本、P50/P95 生成延迟和失败类型。

不得把以下指标单独当作产品成功：

- 总截图数；
- 总卡片数；
- 总刮开次数；
- SSR 数量；
- 十连完成率；
- 连续签到天数。

## 11. 仍需通过实验决定的问题

以下不是方向性争论，而是 P0 实验参数：

- 首页两个模式的视觉权重和默认焦点；
- 连续模式是否允许跨天继续；
- R / SR / SSR 的初始阈值与冷启动置信度；
- 语义刮开覆盖阈值、动效强度和可访问替代；
- 自评信号与真实回忆表现的调度权重；
- 各平台媒体抓取的最终字节、时长和时间窗口阈值；
- 原截图长期保留策略与备份清除 SLA。

## 12. 参考

- Apple, [App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups/)
- Apple, [App Extension Programming Guide: Handling Common Scenarios](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html)
- Apple, [Share Extension](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html)
- Apple, [`URLSessionConfiguration.sharedContainerIdentifier`](https://developer.apple.com/documentation/Foundation/URLSessionConfiguration/sharedContainerIdentifier)
- Balci & Morris (2026), badges may reduce intrinsic motivation while freedom of choice supports autonomy, [DOI: 10.1002/jcal.70234](https://doi.org/10.1002/jcal.70234)
- Kurnaz & Koçtürk (2025), educational gamification motivation meta-analysis with substantial heterogeneity, [DOI: 10.1002/pits.70056](https://doi.org/10.1002/pits.70056)
- Cranney et al. (2009), retrieval practice and corrective feedback, [DOI: 10.1002/acp.1630](https://doi.org/10.1002/acp.1630)
- Candel et al. (2020), formative feedback and confidence calibration, [DOI: 10.1111/jcal.12439](https://doi.org/10.1111/jcal.12439)
