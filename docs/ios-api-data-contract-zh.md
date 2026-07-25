# 哦莫 iOS API / 数据结构契约

> 这份文档用于 MacBook / Xcode 迁移阶段。它定义 iOS 端应使用的 Swift `Codable` 模型、Service 方法和状态处理口径。PRD 仍是产品需求源头；当前截图唤醒主链以 `CaptureMemoryCardV2` 为准，后半部分的 Chapter API 仅用于旧内容兼容。

## 1. 使用原则

- iOS 端不直接调用大模型，不承载 prompt、题目质量判断或文章正文提取逻辑。
- iOS 端通过后端 API 获取截图记忆卡、来源上下文、调度与反馈；旧章节、题目、复习会话和通知继续作为兼容数据读取。
- iOS 端在云端 / 本地 API 模式下为每个请求附带匿名设备身份请求头 `X-Device-Id`。第一版不做账号，后端按设备隔离数据。
- 截图主链中 `Capture`、Evidence、Memory Card 和 Schedule 是独立边界；旧 MVP 的 `Chapter` 仍同时保存来源信息，不单独拆 `Source` 表。
- 当前云端原型使用 PostgreSQL 持久化截图捕获、记忆卡、章节、生成任务和通知；本地没有 `DATABASE_URL` 时仍 fallback 到内存，方便 HTML Demo 和调试。
- `/api/sources/image-flow`、`/api/memory-cards` 及卡片反馈 / 删除接口是截图唤醒主入口；`/api/chapters` 和 `/api/generate` 只保留给旧章节、HTML Demo 与调试兼容，不得再描述成当前未来主入口。

## 2. 枚举

### ChapterStatus

```text
submitted
extracting_content
generating_points
generating_questions
quality_checking
auto_regenerating_questions
completed
failed_extract_article
failed_extract_video
failed_points
failed_questions
failed_no_qualified_questions
```

前台文案映射：

| status | iOS 展示 |
| --- | --- |
| `completed` | 已生成 |
| `submitted` / `extracting_content` / `generating_points` / `generating_questions` / `quality_checking` / `auto_regenerating_questions` | 处理中 |
| `failed_extract_article` | 文章正文提取失败 |
| `failed_extract_video` | 当前暂未接入视频文本提取 |
| `failed_points` | 暂时没能提取出可复习知识点 |
| `failed_questions` / `failed_no_qualified_questions` | 暂时没能生成可复习题目 |

`auto_regenerating_questions` 是后端内部自动恢复阶段，前端不得展示“正在重新生成题目”，应继续显示“正在检查题目质量”，避免让用户感知为生成失败后又从头来过。

### SourceType

```text
text
article_link
wechat_article
video_link
```

### KnowledgeType

```text
concept
judgment
method
scenario
counterexample
comparison
step
```

### QuestionType

```text
multiple_choice
true_false
scenario_judgment
```

### ReviewSessionStatus

```text
active
completed
abandoned
```

### AttemptResult

```text
correct
incorrect
unknown
```

### FeedbackType

```text
answer_wrong
too_easy
unclear
unrelated_to_source
```

严重反馈：`answer_wrong`、`unclear`、`unrelated_to_source`。  
轻反馈：`too_easy`。

### 截图主链枚举

```text
CaptureDisposition:
create_card
archive_only
needs_confirmation

CaptureSourceStatus:
verified
partial
unconfirmed

CaptureContextCompleteness:
full
partial
screenshot_only

MemoryAssessment:
remembered
fuzzy
forgot
```

## 3. 核心模型

### CaptureMemoryCardV2（当前截图主合同）

模型分析保持 `schemaVersion = "capture_memory_card_2"`。数组是当前正式字段，单数 `memoryCard` / `schedule` 是至少保留一个兼容版本的首卡镜像：

```json
{
  "schemaVersion": "capture_memory_card_2",
  "disposition": "create_card",
  "sourceStatus": "verified",
  "decisionReason": "证据充分，生成两张语义独立的卡。",
  "sourceContext": {},
  "memoryCards": [{}, {}],
  "memoryCard": {},
  "schedules": [
    { "cardId": "card-a", "nextReviewAt": "2026-07-25T08:00:00.000Z", "intervalDays": 0 },
    { "cardId": "card-b", "nextReviewAt": "2026-07-25T08:00:00.000Z", "intervalDays": 0 }
  ],
  "schedule": {
    "cardId": "card-a",
    "nextReviewAt": "2026-07-25T08:00:00.000Z",
    "intervalDays": 0
  }
}
```

规则：

- `create_card` 时 `memoryCards` 为 1–3 张，默认一张；只有 2–3 个候选语义独立、分别可主动回忆且各自证据充分时才允许多卡；
- `archive_only` / `needs_confirmation` 时 `memoryCards = []`、`memoryCard = null`、`schedules = []`、`schedule = null`；
- `memoryCard` 恒等于 `memoryCards[0]`，`schedule` 恒等于 `schedules[0]`；新客户端优先读取数组，旧响应没有数组时回退到单数；
- 三种 recall variant 是每张卡的复现形式，不是把同一知识点拆成三张卡；
- 服务端最多做一次质量修复；四张以上、语义重复、Evidence ID 无效或答案不唯一时不得由客户端静默截断。

单张正式卡的核心字段：

```json
{
  "id": "card-a",
  "coreKnowledge": "主动回忆能够暴露记忆缺口。",
  "recallCue": "主动回忆有什么作用？",
  "hiddenSemantic": "暴露记忆缺口",
  "explanation": "尝试提取比直接重读更容易发现没有真正记住的部分。",
  "sourceEvidenceIds": ["block-2"],
  "rarity": "R",
  "rarityReason": "这是可直接使用的局部学习方法。",
  "rarityConfidence": 0.84,
  "rarityRuleVersion": "capture_rarity_2",
  "recallVariants": [],
  "sourceStatus": "verified",
  "sourceTitle": "主动回忆",
  "sourceUrl": "https://example.com/source",
  "sourceContext": {},
  "captureGroup": {}
}
```

### CaptureGroup（持久化分组）

每张通过 `GET /api/memory-cards` 返回的正式卡都是独立可寻址记录，并携带：

```json
{
  "captureId": "capture-1",
  "cardIds": ["card-a", "card-b"],
  "count": 2,
  "index": 0
}
```

- `index` 是 0-based；`cardIds` 是 canonical 顺序；
- 刷新、数据库返回顺序变化或重复截图不得改变 canonical 顺序；
- 重复截图返回首次持久化的完整 group，不用新模型输出覆盖既有卡、调度或掌握状态；
- 每张卡拥有独立 Schedule、Assessment、mastery 和删除生命周期；
- 删除一张卡后，兄弟卡继续存在；服务端返回的剩余组重新保持一致的 `cardIds`、`count` 和 0-based `index`；
- UI 仍一次只呈现一张；卡叠与 `1/N` 只说明同一内容含有多个独立记忆点，不要求一次完成整组。

### CaptureSourceContextV1（当前截图附近的内容）

正式 shape：

```json
{
  "schemaVersion": "capture_source_context_1",
  "nearbyText": "截图附近的来源原文。",
  "focusBlockIds": ["block-2"],
  "blocks": [
    {
      "id": "block-1",
      "type": "paragraph",
      "text": "来源概览段落。",
      "sourceRole": "overview"
    },
    {
      "id": "block-2",
      "type": "subtitle",
      "text": "截图附近的来源原文。",
      "sourceRole": "focus",
      "startSeconds": 18.5,
      "endSeconds": 31
    }
  ],
  "overview": {
    "summary": "来源整体脉络摘要。",
    "highlights": ["主动回忆先于反馈", "熟悉感不等于掌握"]
  },
  "completeness": "full"
}
```

字段与上限：

- `sourceContext` 由服务端从来源 block 和截图焦点确定性构建，不由模型另写一段“附近内容”；
- `focusBlockIds` 只能引用 `blocks[].id`；视频 block 的 `startSeconds` / `endSeconds` 均为可选秒数；
- 最多 64 个 block、合计 40,000 字符；`nearbyText` 最多 8,000 字符，`overview.summary` 最多 800 字符，`overview.highlights` 最多 3 条；
- `completeness` 只能是 `full`、`partial`、`screenshot_only`，不得把局部转写展示成完整视频理解；
- 客户端按 `overview` 在前、blocks 在后的顺序显示，并对 `focusBlockIds` 对应项标记“当前截图附近”；
- 缺少正式上下文时显示“内容脉络仍在补全”，不得在本地生成替代原文。

揭示与无障碍约束：

- 回忆答案尚未揭示时，入口文案为“查看脉络并揭晓”；
- 点击该入口必须先调用与刮开 / 一键揭示相同的 reveal 状态转换，再打开上下文；
- 揭示前不得把 `hiddenSemantic`、证据原句或能直接推出答案的文本放入可读 DOM、VoiceOver label / value / hint 或其他无障碍树；
- 已揭示后可直接打开“当前截图附近的内容”；Sheet 关闭后焦点回到原入口；
- Dynamic Type 下 block 允许自然增高，Reduce Motion 只取消过场，不改变揭示门槛。

### Chapter

```json
{
  "id": "chapter-1",
  "title": "如何把 AI Agent 用进你的生意",
  "status": "completed",
  "displayStatusText": "已生成",
  "failureReason": "",
  "source": {},
  "sourceType": "wechat_article",
  "sourceText": "原始或提取后的正文",
  "coreSummary": "这篇内容围绕企业使用 AI 的真实落地问题展开，重点讨论信任、场景识别和低风险验证如何影响 AI 顾问的价值。",
  "knowledgePoints": [],
  "filteredKnowledgePoints": [],
  "questions": [],
  "qualitySummary": {},
  "generationMeta": {},
  "reviewSession": null,
  "masteredPoints": 0,
  "removedQuestionIds": [],
  "downgradedQuestionIds": [],
  "feedbackRecords": [],
  "dismissedFromNotifications": false,
  "createdAt": "2026-05-16T00:00:00.000Z",
  "updatedAt": "2026-05-16T00:00:00.000Z"
}
```

`coreSummary` 是章节总结页展示的文章整体核心摘要，基于原文全文生成，不是知识点列表、题目解释或复习建议；旧章节可能为空字符串。

`masteredPoints` 表示该章节长期累计已掌握的知识点数量，不是当前这一轮 `ReviewSession` 的临时进度。章节一旦完成过复习，重新开始第二轮复习不会把 `masteredPoints` 清零；前端应继续把它作为“已完成/已掌握”的用户反馈依据。

### ChapterSource

```json
{
  "type": "article_link",
  "title": "文章标题",
  "url": "https://example.com/article",
  "accountOrDomain": "example.com",
  "rawInput": "用户粘贴的原始输入",
  "extractedText": "提取后用于生成题目的正文",
  "chapterId": "chapter-1"
}
```

兼容字段：当前 Demo 仍可能读取 `account`、`rawText`、`cleanedText`，它们分别等价于 `accountOrDomain`、`rawInput`、`extractedText`。

### KnowledgePoint

```json
{
  "id": "kp-1",
  "chapterId": "chapter-1",
  "title": "行业 AI 顾问的机会",
  "summary": "企业知道需要 AI，但缺少可信的落地顾问。",
  "keyClaim": "AI 顾问价值来自帮企业识别真实场景和建立信任。",
  "knowledgeType": "scenario",
  "structureRole": "method_step",
  "importanceScore": 4,
  "coverageReason": "该点既支撑文章主线，也能迁移为判断企业 AI 落地机会的方法。",
  "sourceSnippet": "公司知道自己需要 AI，只是不知道该信任谁。",
  "sourceQuote": "公司知道自己需要 AI，只是不知道该信任谁。",
  "sourceOrder": 0,
  "sourceStartOffset": 124,
  "sourceEndOffset": 148,
  "testabilityScore": 4,
  "masteryScore": 50,
  "answeredCount": 0,
  "lastReviewedAt": null,
  "lastDecayAppliedAt": null,
  "createdAt": "2026-05-16T00:00:00.000Z",
  "updatedAt": "2026-05-16T00:00:00.000Z"
}
```

`masteryScore` 前台不展示，只影响复习队列和强化逻辑。

`structureRole`、`importanceScore`、`coverageReason` 用于服务端筛选和质量评测。MVP 采用“主线 + 可用方法型”：知识点数量随文章长短和内容密度变化，短内容可以只有少量知识点，普通文章通常保持精简，长文、清单、访谈或多段论证可以保留更多必要节点；无论数量多少，都优先覆盖文章核心观点，并保留可迁移的方法、判断原则、适用场景和少量关键误区。旧章节可能缺少这些字段，iOS 必须兼容缺失值。

### ReviewQuestion

```json
{
  "id": "q-1",
  "chapterId": "chapter-1",
  "knowledgePointId": "kp-1",
  "pointId": "kp-1",
  "pointTitle": "行业 AI 顾问的机会",
  "type": "scenario_judgment",
  "stem": "某家传统企业想尝试 AI，但不知道从哪里开始。哪种服务最符合文章中的机会判断？",
  "options": [
    { "id": "A", "text": "直接销售通用提示词模板" },
    { "id": "B", "text": "帮企业识别场景、评估风险并陪跑落地" },
    { "id": "C", "text": "只推荐最热门的大模型工具" },
    { "id": "D", "text": "先做一个完全自动化系统替代所有员工" }
  ],
  "correctOptionId": "B",
  "correctUnderstanding": "AI 顾问的核心不是卖工具，而是帮助企业把 AI 用到可信、具体、低风险的业务场景中。",
  "commonMisconception": "容易把 AI 顾问理解成工具推荐或模板售卖。",
  "sourceSnippet": "真正的问题是，公司知道自己需要 AI，只是不知道该信任谁。所以 AI 顾问的价值不只是推荐工具，而是通过低风险试点、边界说明和证据回看帮助团队建立信任。",
  "sourceOrder": 0,
  "sourceStartOffset": 124,
  "sourceEndOffset": 148,
  "difficulty": "medium",
  "qualityScore": {},
  "qualityIssues": [],
  "trustDiagnostics": {
    "answerGroundingScore": 5,
    "explanationFaithfulnessScore": 4,
    "contextRelevanceScore": 5,
    "misconceptionSupportScore": 3,
    "sourcePrecisionScore": 5
  },
  "confidenceReasons": [],
  "blockingReasons": [],
  "sourceEvidenceRole": "mechanism",
  "sourceBlockId": "p12-s0-1",
  "sourceEvidenceDiversityScore": 4,
  "sourceReuseReason": "",
  "sourceMinimalityScore": 5,
  "sourceOverlapGroupId": "",
  "sourceOverlapRatio": 0,
  "confidenceLevel": "high"
}
```

`confidenceLevel` 取值为 `high` / `low`。`low` 表示该题未完全通过质量审查，但结构完整、来源基本可支撑、答案唯一，因此作为低置信题进入复习池；第一版 iOS 不向用户展示该标签，只用于质量工作台、debug 和后续迭代。

`trustDiagnostics` 是后端可信度诊断，不是人工金标：

- `answerGroundingScore`：正确答案是否被来源上下文支撑。
- `explanationFaithfulnessScore`：解释是否忠实于来源和正确答案。
- `contextRelevanceScore`：来源片段是否是帮助理解题目的有效上下文。
- `misconceptionSupportScore`：常见误区是否与题目和来源相关。
- `sourcePrecisionScore`：来源片段是否精准、克制、适合作为解释页回看片段。

`confidenceReasons` 记录低置信原因，例如 `weak_source_support`、`weak_explanation_faithfulness`、`weak_context_relevance`、`question_type_mismatch`、`judge_rewrite`。`blockingReasons` 记录不可入池原因，例如 `answer_not_unique`、`structure_invalid`、`weak_source_support`。

v7 以后，部分低置信原因会被拆成更具体的可修复标签，例如：

- `answer_grounding_weak`：答案和来源的支撑关系偏弱。
- `explanation_overextends_source`：解释延伸超过来源证据。
- `explanation_not_tied_to_answer`：解释没有紧扣正确答案。
- `misconception_too_generic`：常见误区太泛，不像真实混淆。
- `misconception_not_grounded`：常见误区没有被题干、选项或来源边界支撑。

来源片段 v4 字段用于质量工作台和后续调试，iOS 用户侧第一版可以忽略：

- `sourceEvidenceRole`：来源证据角色，例如 `definition`、`mechanism`、`contrast`、`example`、`boundary`、`method`。
- `sourceBlockId`：后端从原文切出的证据块 ID，用于诊断多题是否复用同一原文节点；iOS 正式页面不需要展示。
- `sourceEvidenceDiversityScore`：同一知识点多题是否使用了不同证据块 / 证据角色的机器评分，1-5 分。
- `sourceReuseReason`：如果复用同一证据块，记录原因或诊断说明；为空表示未发现需要说明的复用。
- `sourceMinimalityScore`：来源是否接近“最小充分证据”的机器评分，1-5 分。
- `sourceOverlapGroupId` / `sourceOverlapRatio`：用于诊断多题是否复用同一语义大段来源。

`sourceOrder`、`sourceStartOffset`、`sourceEndOffset` 用于保持章节内顺序和来源定位。`sourceOrder` 表示知识点或题目在原文中的相对顺序；offset 是基于清洗后正文的字符位置，旧章节可能为空。iOS 展示知识点、题目和首次复习队列时应优先按 `sourceOrder` 排序，保证用户沿文章脉络复习。

出题策略：

- 每个可复习知识点尽量至少对应 1 道题；理想情况下每个高价值知识点入池 3 道递进复习题，用不同认知动作强化记忆。
- 多题目标不是机械换题型，而是覆盖不同 `memoryAngle`：核心回忆、边界辨析、场景迁移。
- v7 后端会为知识点生成内部 `practiceBlueprint`，每道题可带 `blueprintItemId`、`blueprintGoal`、`memoryAngleFitScore`、`blueprintAlignmentScore`、`typeDiversityReason`。这些字段用于质量工作台和实验报告，iOS 正式页面可以忽略。
- v8 后端会增加教学质量审查字段：`pedagogyDiagnostics`、`cognitiveActionFitScore`、`practiceProgressionScore`、`practiceDuplicateRiskScore`、`evidenceLearningValueScore`、`sourceReuseLearningReason`。这些字段用于判断题目是否真的完成“核心回忆 / 边界辨析 / 场景迁移”、同知识点多题是否递进、来源是否有学习导航价值；iOS 正式页面继续忽略。
- 后端最终入池最多保留 3 道题。选择器优先保留来源支撑、答案唯一、解释忠实的题；其次优先覆盖不同 `memoryAngle`；再次才考虑不同题型的 `multiple_choice`、`true_false`、`scenario_judgment`。
- 普通知识点可以少于 3 道题，生成不齐不导致章节失败；只有最终 0 道可复习题时才返回 `failed_no_qualified_questions`。
- 题目入池后按对应知识点在原文中的位置排序；首次复习按文章内容先后推进，帮助用户像重新走一遍文章主线一样主动回忆。
- 后端推荐题型，但题型不匹配不是硬失败；v8 以后题型只作为 `type_fit_warning` 诊断，真正影响质量的是题目是否完成对应认知动作。
- 如果一个知识点 3 道题都是同一题型，后端应通过质量诊断记录原因。只要 3 道题覆盖了不同 `memoryAngle`，同题型可以接受；如果只是换壳重复，即使题型不同也不应全部入池。
- 边界、分工、机制对比类知识点应优先生成工具选择、边界辨析、场景归因或错误方案诊断题。干扰项必须来自真实混淆对象；解释应说明其它选项为什么不合适。
- `correctUnderstanding` 和 `commonMisconception` 必须忠实于来源证据。若解释、误区或干扰项存在轻度来源风险，题目可以低置信入池；若答案不唯一、来源完全不支撑或解释明显幻觉，则不能入池。
- 文章开头的导读、金句摘录、编辑摘要只用于理解主题，不能作为知识点 `sourceQuote` 或题目来源锚点。若观点只在导读区出现、正文没有展开，后端会按 `lead_summary_source` 过滤该知识点；若正文有展开，必须锚定正文段落。
- `sourceSnippet` 是 iOS 解释页用户可见的原文最小充分证据。后端以知识点 `sourceQuote`、题干、正确理解、常见误区和知识点主张为线索，在 `cleanedText` 中定位最能解释本题的原文句子窗口。
- 后端选择 `sourceSnippet` 时优先返回 1-3 句足以支撑答案和解释的原文；如果最小证据不足以理解题目，才扩展相邻句，并通过 `sourceContextSelection` 记录扩展原因。完整上下文由“查看完整来源”页面承担。
- `sourceSnippet` 必须来自原文；如果无法可靠定位，后端只回退到知识点 `sourceQuote`，并将题目标记为低置信。
- `qualitySummary` 可能包含 `averageQuestionsPerPoint`、`questionCountDistribution`、`questionTypeCoverage` 等统计，用于质量工作台和调试；iOS 正式页面可以忽略这些字段。

解释页只展示：正确答案、正确理解、常见误区、来源片段。

### ReviewSession

```json
{
  "schemaVersion": 2,
  "id": "session-1",
  "chapterId": "chapter-1",
  "status": "active",
  "queue": [
    { "id": "queue-1", "pointId": "kp-1", "questionId": "q-1", "isReinforcement": false, "reinforcementAttempt": 0 }
  ],
  "reinforcementQueue": [],
  "currentQueueIndex": 0,
  "attempts": [],
  "masteryByPointId": { "kp-1": 50 },
  "answeredPointIds": [],
  "masteredThisRoundPointIds": [],
  "completedQueueItemIds": [],
  "correctQuestionIds": [],
  "needsReviewQuestionIds": [],
  "skippedPointIds": [],
  "createdAt": "2026-05-16T00:00:00.000Z",
  "updatedAt": "2026-05-16T00:00:00.000Z",
  "completedAt": null
}
```

完成条件：

- ReviewSession v2 以题目队列为唯一复习事实来源，而不是以知识点数量推断进度。
- 所有可用主队列题目都必须进入本轮复习；同一知识点有 1-3 道入池题时，这些题都会进入队列。
- 所有可用 `queue` 项都进入 `completedQueueItemIds` 后，本轮才完成。
- 答错或“忘记了”会针对当前 `questionId + queueItemId` 安排强化题；同一题本轮最多强化 2 次，仍未答对则进入 `needsReviewQuestionIds`，但不阻塞本轮结束。
- `masteredThisRoundPointIds` 由题目结果聚合：一个知识点的主队列题目都答对后，才计入本轮掌握。

队列顺序：

- 首次创建 ReviewSession 时，后端按原文知识点顺序创建题目队列，同一知识点内按题型/生成顺序稳定排列。
- 答错或“不知道”后的强化题仍按章节内强化规则插入，例如间隔 3 题后再次出现。
- 恢复未完成 ReviewSession 时保持原队列，不因为章节重新排序而打断用户进度。
- 旧版 active session 会在下一次开始/恢复时迁移到 `schemaVersion: 2`，保留已答对题目的完成事实。

### ReviewAttempt

```json
{
  "id": "attempt-1",
  "reviewSessionId": "session-1",
  "chapterId": "chapter-1",
  "knowledgePointId": "kp-1",
  "questionId": "q-1",
  "queueItemId": "queue-1",
  "answer": "B",
  "result": "correct",
  "isReinforcement": false,
  "masteryScoreBefore": 50,
  "masteryScoreAfter": 65,
  "invalidatedByFeedback": false,
  "skippedDueToQuestionFeedback": false,
  "answeredAt": "2026-05-16T00:00:00.000Z"
}
```

分数规则：

- 首次答对：`+15`
- 首次答错 / 不知道：`-20`
- 强化答对：`+10`
- 强化仍错 / 不知道：`-15`
- 分数限制在 `0-100`。

### QuestionFeedback

```json
{
  "id": "feedback-1",
  "questionId": "q-1",
  "knowledgePointId": "kp-1",
  "chapterId": "chapter-1",
  "reviewSessionId": "session-1",
  "feedbackType": "unclear",
  "severity": "severe",
  "actionTaken": "removed_from_pool",
  "invalidatedAttemptId": "attempt-1",
  "createdAt": "2026-05-16T00:00:00.000Z"
}
```

处理规则：

- `answer_wrong` / `unclear` / `unrelated_to_source`：撤销最近一次有效 attempt，题目从本轮复习移除。
- `too_easy`：只对当前用户降权，不撤销 attempt，不移除题。

### NotificationItem

```json
{
  "id": "notification-1",
  "chapterId": "chapter-1",
  "type": "generation_completed",
  "title": "生成完成",
  "body": "章节已生成，可以开始复习",
  "read": false,
  "dismissed": false,
  "pushAttemptedAt": "",
  "pushSentAt": "",
  "pushDeliveryStatus": "",
  "pushDeliveryError": "",
  "pushAttemptCount": 0,
  "createdAt": "2026-05-16T00:00:00.000Z"
}
```

通知点击统一进入章节详情，不直接进入题卡。

`push*` 字段用于后端诊断系统推送发送结果，iOS 用户侧不展示。它们可以帮助判断通知没有出现时是 token 未上传、APNs 环境不匹配，还是 Apple 返回了具体发送错误。

## 4. API 契约

### 截图提交与任务轮询（当前主链）

```text
POST /api/sources/image-flow
GET  /api/sources/image-flow/jobs/:jobId
```

提交成功后客户端按真实任务阶段轮询。完成响应优先读取：

```json
{
  "captureId": "capture-1",
  "captureAnalysis": {
    "schemaVersion": "capture_memory_card_2",
    "disposition": "create_card",
    "sourceStatus": "verified",
    "sourceContext": {},
    "memoryCards": [{}, {}],
    "memoryCard": {},
    "schedules": [{}, {}],
    "schedule": {}
  },
  "memoryCards": [{}, {}],
  "memoryCard": {}
}
```

顶层数组与 `captureAnalysis` 数组用于兼容不同任务读取路径；客户端优先使用 `captureAnalysis.memoryCards`，其次使用顶层 `memoryCards`，最后回退到单数 `memoryCard`。不要把两个数组拼接，否则会制造重复卡。

### 读取截图卡

```text
GET /api/memory-cards
GET /api/memory-cards?pool=due
```

返回的 `cards` 是逐卡记录。同一 capture 的兄弟卡通过每张记录上的 `captureGroup.cardIds` 重建；不要假定相邻数组元素一定属于同一组，也不要用响应行顺序替代 `captureGroup.index`。

若旧服务器只返回单卡且没有 `captureGroup`，客户端按 `count = 1` 兼容展示，不伪造多卡。

### 处理待确认片段

```text
POST /api/memory-cards/:id/confirmation
```

确认请求：

```json
{
  "action": "confirm",
  "coreKnowledge": "已持久化识别证据中的连续片段",
  "hiddenSemantic": "可选的连续遮挡片段",
  "recallCue": "可选的回忆提示",
  "sourceEvidenceId": "可选的证据 ID"
}
```

仅存档请求：

```json
{ "action": "archive" }
```

响应的 `schemaVersion` 为 `capture_memory_confirmation_1`：

- `status = confirmed`：`card` 是服务端 canonical 正式卡，客户端用它替换待确认记录并刷新召回池；
- `status = archived`：`card` 保持为碎片，客户端显示“已保存碎片”，不得进入召回池；
- `status = needs_user_input`：HTTP 200，包含 `message`、`requiredFields` 和最多八条 `evidence`；确认面板保持打开，用户继续编辑，不得当作失败后重跑识别。

该接口只复用服务端已经持久化的 Evidence，不上传图片、不调用视觉模型、不搜索来源，也不重新生成原分析。知识库交互固定为：

```text
点击 needs_confirmation
→ 查看来源状态、已保留内容、原因与证据
→ 确认 / 编辑 | 仅存档 | 删除 | 取消
```

删除沿用 `DELETE /api/memory-cards/:id`；取消只关闭面板。`archive_only` 与 `needs_confirmation` 必须使用不同文案和状态，前者不得继续显示“待确认”。

### 记录截图卡反馈

```text
POST /api/memory-cards/:id/assessments
```

请求：

```json
{
  "attemptId": "card-a:2026-07-25T08:00:00.000Z",
  "assessment": "remembered"
}
```

每张卡独立提交，`attemptId` 在同一复习周期内幂等。响应中的服务端 canonical assessment、mastery 和 schedule 优先于客户端预测；不得把该响应复制给同组兄弟卡。

### 删除截图卡

```text
DELETE /api/memory-cards/:id
```

删除是单卡操作。只有服务端确认成功后客户端才从本地移除该卡；兄弟卡继续存在并保留自己的 schedule / mastery。重新获取列表时以服务端最新 `captureGroup` 为准，不复活已删除成员。

### 匿名设备身份

iOS 请求必须附带：

```text
X-Device-Id: <uuid>
```

后端用这个 ID 隔离章节、通知、复习会话、题目反馈和收藏题目。缺少该请求头时，后端使用 `demo-device`，用于 HTML Demo 和简单 curl 调试。账号系统后续再做，未来可把匿名设备数据迁移到登录账号下。

### 注册系统通知 token

```text
POST /api/devices/push-token
```

请求：

```json
{
  "token": "<apns-device-token>",
  "platform": "ios",
  "environment": "production"
}
```

后端按 `X-Device-Id` 保存 APNs token。章节生成成功或失败时，后端会发送系统通知；通知 payload 包含 `notificationId`、`chapterId` 和 `type`，iOS 点击后进入对应章节详情。

iOS 端同步规则：

- 用户首次授权通知并注册 APNs 成功后，立即上传 token。
- App 回到前台时，如果通知已授权，重新注册并同步 token。
- 提交云端生成前后主动同步 token，避免首次授权和生成提交之间存在竞态。
- Xcode Debug 安装上传 `sandbox` token，TestFlight / App Store 上传 `production` token。

### 查询系统通知诊断

```text
GET /api/devices/push-status
```

请求头仍使用当前匿名设备：

```text
X-Device-Id: <uuid>
```

返回：

```json
{
  "ok": true,
  "apns": {
    "configured": true,
    "environment": "production",
    "bundleId": "com.maxhan.shibei"
  },
  "pushTokenCount": 1,
  "pushTokens": [
    {
      "tokenTail": "12ab34cd",
      "platform": "ios",
      "environment": "production",
      "createdAt": "2026-05-25T00:00:00.000Z",
      "updatedAt": "2026-05-25T00:00:00.000Z"
    }
  ],
  "recentNotifications": [
    {
      "id": "notification-1",
      "chapterId": "chapter-1",
      "type": "generation_completed",
      "pushDeliveryStatus": "sent",
      "pushDeliveryError": "",
      "pushAttemptCount": 1
    }
  ]
}
```

该接口只用于诊断，不作为用户功能入口。token 只返回尾号，不能返回完整 APNs token。

### 创建章节

```text
POST /api/chapters
```

请求：

```json
{
  "sourceType": "text",
  "rawText": "用户粘贴的内容"
}
```

文章链接：

```json
{
  "sourceType": "article_link",
  "sourceUrl": "https://example.com/article"
}
```

返回：

```json
{
  "status": "completed",
  "chapter": {},
  "notification": {},
  "message": ""
}
```

失败时仍返回 `chapter`，并写入失败 `status` 和 `failureReason`。

### 章节列表

```text
GET /api/chapters
```

返回：

```json
{ "chapters": [] }
```

排序：按 `createdAt` 倒序。

### 章节详情

```text
GET /api/chapters/:id
```

返回：

```json
{ "chapter": {} }
```

前端展示约定：

- 已完成章节不再展示“状态：已生成”这一类生成状态文案；它对用户没有后续行动价值。
- 生成中和生成失败章节仍展示状态文案，用来说明后台任务进度、失败原因和可重试路径。
- 可复习入口文案由 ReviewSession 状态决定：未开始显示“开始复习”，存在 active session 显示“继续复习”，已完成后再次进入仍显示“开始复习”用于二刷。

### 重新生成章节

```text
POST /api/chapters/:id/regenerate
```

返回：

```json
{
  "status": "completed",
  "chapter": {},
  "notification": {},
  "message": ""
}
```

### 删除章节

```text
DELETE /api/chapters/:id
```

返回：

```json
{ "deleted": true, "chapterId": "chapter-1" }
```

删除章节时，相关通知、复习 session、反馈记录一起删除。

### 创建或恢复复习会话

```text
POST /api/chapters/:id/review-session
```

返回：

```json
{
  "chapter": {},
  "reviewSession": {},
  "currentQuestion": {}
}
```

规则：如果章节已有未完成 session，则恢复；否则创建新 session。

### 获取复习会话

```text
GET /api/chapters/:id/review-session
```

返回：

```json
{
  "chapter": {},
  "reviewSession": {},
  "currentQuestion": {}
}
```

没有 session 时，`reviewSession` 和 `currentQuestion` 为 `null`。

### 记录答题

```text
POST /api/review-sessions/:id/attempts
```

请求：

```json
{
  "queueItemId": "queue-1",
  "questionId": "q-1",
  "answer": "B",
  "result": "correct"
}
```

`queueItemId` 是 v2 客户端应提交的队列项 ID；`questionId` 继续保留用于兼容旧客户端和诊断。

`result` 可为：`correct`、`incorrect`、`unknown`。

返回：

```json
{
  "chapter": {},
  "reviewSession": {},
  "attempt": {},
  "currentQuestion": {}
}
```

### 提交题目反馈

```text
POST /api/questions/:id/feedback
```

请求：

```json
{
  "feedbackType": "unclear"
}
```

返回：

```json
{
  "chapter": {},
  "feedback": {},
  "reviewSession": {}
}
```

### 通知

```text
GET /api/notifications
POST /api/notifications/:id/read
POST /api/notifications/:id/dismiss
```

`dismiss` 只隐藏通知，不删除章节。

系统推送和 App 内通知共用同一条通知记录：成功通知点击后归档；失败通知点击后只标记已读，直到用户处理或手动移除。

### 收藏题目

收藏题目是题目级用户状态，不代表题目质量，也不改变默认章节复习队列。它用于构建系统题集“收藏题目”，让用户回到自己标记过的高价值题。

iOS 展示层可以按知识点聚合收藏记录：卡片主文字展示对应知识点，辅助文字展示该知识点下已收藏题目数量，例如“已收藏 2 题”。这种聚合只影响列表呈现和入口选择，后端仍以单题收藏记录作为事实来源。点击某个知识点卡片时，客户端用该组收藏题构建轻量复习流。

```text
GET /api/favorites/questions
POST /api/favorites/questions
DELETE /api/favorites/questions/:id
```

列表返回：

```json
{
  "favorites": [
    {
      "id": "favorite-chapter-1-q-1",
      "chapterId": "chapter-1",
      "questionId": "q-1",
      "createdAt": "2026-05-25T00:00:00.000Z"
    }
  ]
}
```

创建请求：

```json
{
  "chapterId": "chapter-1",
  "questionId": "q-1"
}
```

创建返回：

```json
{
  "favorite": {
    "id": "favorite-chapter-1-q-1",
    "chapterId": "chapter-1",
    "questionId": "q-1",
    "createdAt": "2026-05-25T00:00:00.000Z"
  }
}
```

删除返回：

```json
{
  "deleted": true,
  "favoriteId": "favorite-chapter-1-q-1"
}
```

规则：

- 所有接口都按 `X-Device-Id` 隔离，只能读取或修改当前匿名设备下的收藏。
- 同一个 `deviceId + chapterId + questionId` 只能有一条收藏记录；重复创建应返回同一条或更新后的收藏记录。
- 创建收藏时后端必须校验章节和题目属于当前设备。
- 删除章节或删除当前设备数据时，相关收藏题目一并删除。
- 收藏题复习由 iOS 根据收藏记录和本地章节/题目数据组装题卡；第一版不单独创建后端 ReviewSession。

## 5. iOS Service 建议

SwiftUI 第一版建议拆出：

- `CaptureMemoryService`
  - `submitScreenshot(input:)`
  - `getImageFlowJob(id:)`
  - `listMemoryCards(pool:)`
  - `resolveConfirmation(cardId:request:)`
  - `submitAssessment(cardId:attemptId:assessment:)`
  - `deleteMemoryCard(id:)`

- `ChapterService`
  - `createChapter(input:)`
  - `listChapters()`
  - `getChapter(id:)`
  - `regenerateChapter(id:)`
  - `deleteChapter(id:)`

- `ReviewService`
  - `startOrResumeSession(chapterId:)`
  - `getSession(chapterId:)`
  - `submitAttempt(sessionId:questionId:answer:result:)`
  - `submitFeedback(questionId:type:)`

- `NotificationService`
  - `listNotifications()`
  - `markRead(id:)`
  - `dismiss(id:)`

- `FavoriteQuestionService`
  - `listFavoriteQuestions()`
  - `createFavoriteQuestion(chapterId:questionId:)`
  - `deleteFavoriteQuestion(id:)`

`CaptureMemoryService` 是当前截图主链；Chapter、Review、Notification 和 Favorite service 只服务旧章节兼容。Xcode 可用 Fixture 验证 Codable 和状态恢复，但最终截图闭环必须切换到真实 HTTP 实现。前端集中迭代允许录制少量真实图片的 canonical `GET /api/memory-cards` 结果作为版本化 DEBUG Fixture；缓存不得包含图片字节、base64、密钥或完整模型响应。R / SR / SSR 视觉覆盖卡必须与 canonical disposition 分开标记，不得冒充模型正式判级。Schema、Prompt、模型或 Adapter 未变化时，普通 UI 改动默认复用该缓存，不重复调用真实 API。

## 6. 当前限制

- Railway 云端通过 PostgreSQL 保存数据；本地未配置 `DATABASE_URL` 时使用内存存储，不保证跨重启。
- 当前 API 未做账号和鉴权，但已经按匿名设备 ID 做基础数据隔离。截图卡、章节、通知、复习状态、反馈和收藏题目都应绑定同一个匿名设备身份。
- 当前截图与旧章节生成流程都是提交后后台执行，客户端分别轮询 image-flow job 或章节状态；后续正式生产版可再升级为队列、SSE、APNs 或后台任务系统。
- 公众号抓取受平台限制，失败时应提示用户改为粘贴正文。
- 旧 Chapter API 的视频链接仍只识别并友好失败；截图 image-flow 是否取得平台字幕或局部内容，以其 `sourceContext.completeness` 和实际来源结果为准。
- 当前截图 API 已支持 1–3 张独立卡、canonical capture group 和 `capture_source_context_1`；这不表示知识图谱、社交或新平台 Adapter 已实现。
- 当前前端集中迭代不改截图识别、来源恢复和平台 Adapter；待确认接口只复用已有 Evidence。
- live Qwen/TikHub、真实 Postgres worker 恢复、Xcode 编译、Simulator、真机 VoiceOver 必须分别留存验证证据，Fixture 或静态合同测试不能替代。
