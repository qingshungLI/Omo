# TikHub Multimodal Content Review

一个可运行的内容处理 MVP：通过 TikHub 拉取小红书、抖音、Bilibili、YouTube、微信公众号和知乎内容，统一正文/图片/视频/音频，再完成 OCR、ASR、视频关键帧 review 和结构化总结。

完整的逐文件、逐函数说明见 [`docs/codebase-guide.md`](docs/codebase-guide.md)。视频实际下载、抽帧和 ASR 的核心实现位于 `app/media.py`。

## 处理链路

```text
内容链接 / 博主主页或平台 ID
  -> TikHub 详情或作品列表
  -> 统一 ContentItem
  -> 平台字幕（YouTube/Bilibili，优先）
  -> FFmpeg：视频抽关键帧 + 音轨
  -> ASR（无字幕时，OpenAI-compatible）
  -> Claude Vision：图片 OCR、关键帧理解、全文总结
  -> 结构化 ReviewSummary
```

Claude API 目前不直接接收 MP4。本项目所说的 video review 是“字幕/ASR + 按时间顺序抽取的关键帧 + 视频元数据”联合分析，这也是当前可稳定落地的方式。

## 启动

要求 Python 3.11+ 和 FFmpeg。

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

打开 `http://127.0.0.1:8000/docs` 调试 API。

不配置任何密钥也能运行 TikHub 固定样本（使用本地 fallback 摘要）：

```bash
.venv/bin/social-review demo --sample wechat
curl -X POST 'http://127.0.0.1:8000/v1/demo?sample=wechat'
```

## 配置

复制 `.env.example` 为 `.env`，至少申请：

- `TIKHUB_API_KEY`：真实平台采集必须。
- `ANTHROPIC_API_KEY`：图片 OCR/理解、视频关键帧 review 和最终结构化总结。
- `OPENAI_API_KEY`：无平台字幕时的 ASR。也可以通过 `OPENAI_BASE_URL` 接兼容 `/audio/transcriptions` 的服务。

推荐默认模型为 `claude-sonnet-5`，可通过 `CLAUDE_MODEL` 覆盖。中国大陆可将 `TIKHUB_BASE_URL` 改为 `https://api.tikhub.dev`。

## API 示例

单条链接，平台可自动识别：

```bash
curl -X POST http://127.0.0.1:8000/v1/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "auto",
    "content_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "analyze_media": true,
    "language": "zh-CN"
  }'
```

拉取博主最近内容：

```bash
curl -X POST http://127.0.0.1:8000/v1/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "platform": "bilibili",
    "creator": "https://space.bilibili.com/CREATOR_UID",
    "max_items": 5,
    "analyze_media": true
  }'
```

`creator` 支持主页链接或平台 ID。ID 类型如下：

| 平台 | creator ID |
| --- | --- |
| 抖音 | `sec_user_id`，主页链接也可自动解析 |
| 小红书 | `user_id`，主页分享链接也可 |
| Bilibili | UID，主页链接也可自动解析 |
| YouTube | channel ID，频道链接也可自动解析 |
| 公众号 | `gh_username`（`gh_...`） |
| 知乎 | `user_url_token`，用户主页链接也可 |

公众号普通主页/文章 URL 不一定暴露 `gh_username`，因此“公众号博主列表”明确要求该 ID；单篇公众号文章直接传 `content_url` 即可。

## 输出

每条结果包含：

- `item`：统一内容字段、媒体 URL、正文、字幕/ASR 文本、互动元数据。
- `summary`：一句话总结、概述、要点、时间线、画面发现、原文引句、标签、风险。
- `trace`：是否用了平台正文/字幕/ASR、抽帧数、图片数、模型和降级警告。
- `errors`：批处理中的单条错误或降级信息；一条失败不会中止整批。

默认不返回 TikHub 原始响应。调试字段映射时设置 `include_raw: true`。

## 平台适配

当前使用的 TikHub API 包括：

- 抖音：分享链接详情、`sec_user_id` 解析、用户作品列表。
- 小红书：图文详情、用户已发布笔记列表。
- Bilibili：URL 视频详情、用户作品、字幕。
- YouTube：视频详情、频道视频、字幕。
- 公众号 V2：文章详情、账号文章列表。
- 知乎：专栏文章/回答详情、用户文章和回答列表。

平台返回结构可能随上游调整。适配器采用“平台明确字段优先 + 递归容错提取”，并可通过 `include_raw` 保留排查依据。

## 验证

```bash
.venv/bin/pytest
.venv/bin/python -m compileall -q app
```

采集和媒体仅应处理你有权访问、存储和分析的内容；批量任务上线前还需要增加任务队列、持久化、去重、速率限制和数据保留策略。
