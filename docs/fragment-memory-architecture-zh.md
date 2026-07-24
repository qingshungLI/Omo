# 碎片记忆架构

## 产品边界

拾贝解决“看到内容后快速留下、快速理解、以后还能想起来”，不做完整课程或系统知识库。第一阶段输入是链接和文字；截图识别只保留为未来可选入口，不进入主链路。

## 运行链路

```text
iOS 分享/粘贴
  -> source preflight（识别文章、公众号、Bilibili、YouTube、抖音、小红书）
  -> source adapter
     -> 文章：HTML/公众号正文
     -> 视频：平台字幕优先
     -> 无字幕：媒体下载 -> ffmpeg 音频 -> Whisper ASR
  -> normalize + 12k 字符确定性窗口
  -> cache / in-flight 去重
  -> 单次 LLM：title + summary + tags + 3 questions
  -> PostgreSQL chapter
  -> iOS 判断题/选择题复习
```

## BibiGPT 借鉴与修正

[BibiGPT-v1](https://github.com/JimmyLv/BibiGPT-v1) 的关键不是“图片识别快”，而是先取 Bilibili/YouTube 已有字幕，再把受限长度的字幕交给模型；同时使用流式输出和缓存。拾贝借鉴字幕优先、输入限制、缓存和失败回退，但做了两点修正：

1. BibiGPT v1 的长字幕压缩包含随机过滤；拾贝使用头 45% + 中间 20% + 尾 35% 的确定性窗口，保证同一内容输入和缓存键稳定。
2. 拾贝不是只生成摘要，而是在同一次结构化调用中生成可直接渲染的判断题和选择题，避免第二次题目生成请求。

## 性能决策

| 情况 | 行为 | 主要耗时 |
|---|---|---|
| 平台有字幕 | 直接取字幕，不下载视频 | 平台接口 + 1 次 LLM |
| 无字幕 | 下载媒体、抽音频、ASR | 下载 + ASR + 1 次 LLM |
| 画面是关键信息 | 手动打开 `VIDEO_VISUAL_ENABLED=1` | 额外抽帧 + 视觉模型 |
| 内容重复 | TTL/LRU 命中 | 0 次 LLM |
| 同时重复提交 | 共享同一个 in-flight Promise | 1 次 LLM |

默认模型应选低延迟、稳定 JSON 输出的非推理模型。对于摘要与卡片，关闭 thinking 比使用长推理模型更符合收益/耗时比。模型输出上限约 1,000 tokens；图片关键字任务若未来恢复，应继续使用纯文本、64 tokens 左右的独立快接口，不能复用大 schema。

## 学习与反馈

机制以检索练习和间隔复习为核心，而不是用点击量制造虚假活跃：

- 每条收藏立即生成 3 张卡，完成时间控制在 1-3 分钟。
- 答错卡加入 `needsReviewQuestionIds`，在本单元结束前再次出现。
- 每日目标默认 1 张卡，降低启动阻力；连续天数只奖励“完成有效回想”。
- 后续把 `again / hard / good / easy` 写入持久调度字段，并接入 FSRS。
- 标签用于主题云和按月/按年“回忆”视图；点击标签进入该主题的到期卡片。

这些选择与检索练习研究和成熟间隔系统一致：[retrieval practice](https://pubmed.ncbi.nlm.nih.gov/21252317/)、[effective learning techniques review](https://journals.sagepub.com/stoken/rbtfl/Z10jaVH/60XQM/full)、[Anki FSRS](https://docs.ankiweb.net/deck-options.html#fsrs)。

## 下一阶段

1. 将当前进程内摘要缓存迁到 Redis，缓存键保持 `promptVersion + normalized URL/title + bounded text hash`。
2. 增加 iOS Share Extension，让 Safari、Bilibili、YouTube 等直接转发 URL。
3. 在数据库增加标签索引和到期时间，完成主题云、年度回忆与 FSRS 调度。
4. 用真实链接集记录 p50/p95：提取耗时、模型首字节、模型总耗时、缓存命中率和失败原因。
