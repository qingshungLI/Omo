# 代码结构与函数说明

本文档对应当前仓库代码，用于回答以下问题：

- 视频由哪个文件处理？
- 一条内容从 TikHub 拉取到最终总结，经过哪些模块？
- 每个文件、类和函数分别负责什么？

## 1. 视频处理代码在哪里

视频处理不是单个文件独立完成，而是四个模块协作：

| 阶段 | 核心文件 | 职责 |
| --- | --- | --- |
| 获取视频信息和播放地址 | `app/tikhub.py` | 调用 TikHub，选择适合下载和分析的视频流 |
| 编排处理顺序 | `app/pipeline.py` | 决定何时拉字幕、下载媒体、调用 ASR 和总结 |
| 实际处理视频 | `app/media.py` | 下载视频、读取时长、抽关键帧、提取音轨、调用 ASR |
| Claude 视频 review | `app/reviewer.py` | 将关键帧、字幕/ASR、标题、正文和元数据一起交给 Claude |

其中，**真正执行 FFmpeg 视频处理的核心文件是 `app/media.py`**。入口是
`MediaProcessor.prepare()`，关键帧由 `MediaProcessor._extract_frames()` 生成，音频转写由
`MediaProcessor._transcribe()` 完成。

### 1.1 视频调用链

```text
POST /v1/analyze
  -> app.main.analyze()
  -> ReviewPipeline.analyze()
  -> TikHubClient.fetch_content() / fetch_creator()
       -> 获取视频详情和播放地址
  -> TikHubClient.fetch_captions()
       -> YouTube/Bilibili 优先使用平台字幕
  -> MediaProcessor.prepare()
       -> _download() 下载视频
       -> _probe_duration() 获取时长
       -> _extract_frames() 自适应抽关键帧
       -> FFmpeg 提取 16 kHz 单声道 MP3
       -> _transcribe() 在没有字幕时执行 ASR
  -> Reviewer.review()
       -> 关键帧作为 Claude 图片输入
       -> 字幕/ASR 作为文本输入
       -> 输出 ReviewSummary
  -> MediaProcessor.cleanup()
       -> 按配置删除临时媒体文件
```

### 1.2 当前视频处理策略

- 每条内容只下载 `videos`、`audio` 中第一个可用媒体地址。
- 下载前解析域名并拒绝内网、回环、保留地址，降低 SSRF 风险。
- 视频下载上限由 `MAX_DOWNLOAD_MB` 控制，默认 500 MB。
- 使用 `ffprobe` 获取时长；没有 `ffprobe` 时回退到固定抽帧间隔。
- 抽帧间隔为 `min(配置间隔, max(2 秒, 视频时长 / 最大帧数))`。
- 默认最多 12 帧，长边最大 1280 像素，输出 JPEG。
- 平台有字幕时直接使用字幕，不重复调用 ASR。
- 没有字幕时，FFmpeg 将音轨转成 16 kHz、单声道、64 kbps MP3，再交给 OpenAI-compatible ASR。
- Claude API 不直接接收 MP4；当前 video review 输入是“按时间排序的关键帧 + 字幕/ASR + 平台正文和元数据”。

## 2. 应用代码

### 2.1 `app/__init__.py`

Python 包标记文件，仅包含包说明，不定义运行逻辑。

### 2.2 `app/config.py`

集中读取 `.env` 和系统环境变量，并为所有外部服务和媒体参数提供类型约束。

#### `Settings`

配置模型，主要字段包括：

- `tikhub_api_key`、`tikhub_base_url`：TikHub 鉴权和服务地址。
- `anthropic_api_key`、`claude_model`：Claude 鉴权和模型。
- `openai_api_key`、`openai_base_url`、`asr_model`：ASR 服务。
- `media_work_dir`：临时媒体目录。
- `max_download_mb`：单个媒体最大下载体积。
- `max_frames`：单条内容最多送给 review 的图片/关键帧数量。
- `frame_interval_seconds`：长视频抽帧的最大时间间隔。
- `keep_media`：任务完成后是否保留下载文件和关键帧。
- `request_timeout_seconds`：TikHub HTTP 请求超时。

#### `Settings.has_tikhub`

判断是否配置了 TikHub API Key，用于健康检查。

#### `Settings.has_claude`

判断是否配置了 Anthropic API Key。没有配置时，reviewer 使用本地 fallback 摘要。

#### `Settings.has_asr`

判断是否配置了 OpenAI-compatible ASR Key。没有配置且平台无字幕时，处理轨迹会记录降级警告。

#### `get_settings()`

创建并缓存全局 `Settings`。`lru_cache` 保证一个进程内不会反复读取 `.env`；修改环境变量后需要重启服务。

### 2.3 `app/models.py`

定义模块之间传递的统一数据结构和 FastAPI 请求/响应 Schema。

#### `Platform`

平台枚举：自动识别、抖音、小红书、Bilibili、YouTube、微信公众号、知乎。

#### `ContentKind`

内容类型枚举：视频、图文、文章、回答、未知。

#### `AnalyzeRequest`

分析请求模型。支持单条 `content_url` 或博主 `creator`，并控制平台、数量、输出语言、是否分析媒体和是否返回原始 TikHub 数据。

#### `AnalyzeRequest.require_a_source()`

模型级校验器，保证 `content_url` 和 `creator` 至少提供一个。

#### `MediaAsset`

预留的媒体资源模型，包含 URL 和类型。当前主流水线直接使用 `ContentItem.images/videos/audio`，尚未引用此模型。

#### `ContentItem`

跨平台统一内容模型，保存内容 ID、类型、来源 URL、标题、作者、正文、发布时间、图片、视频、音频、字幕/ASR、统计元数据和可选原始响应。

#### `TimelineEntry`

总结中的时间线条目，由可选时间点和事件描述组成。

#### `ReviewSummary`

结构化总结：一句话摘要、概述、关键点、时间线、画面发现、原文引用、标签和风险项。

#### `ProcessingTrace`

记录一条内容实际使用了哪些处理能力，包括平台正文、平台字幕、ASR、关键帧数、图片数、总结器和降级警告。

#### `ItemResult`

聚合原始统一内容、结构化总结和处理轨迹。

#### `AnalyzeResponse`

批量分析响应，包含最终平台、成功结果列表和不中断批次的错误列表。

#### `HealthResponse`

健康检查响应，报告服务状态、三类 API 是否配置以及 FFmpeg 是否可用。

### 2.4 `app/tikhub.py`

TikHub 平台适配器。负责鉴权请求、平台识别、单条内容和博主列表拉取、字幕拉取，以及把不同平台响应归一化成 `ContentItem`。

#### `TikHubError`

TikHub 访问、响应解析、平台识别和参数提取失败时使用的统一异常。

#### `_walk(value)`

递归遍历任意字典/列表，逐个产出 `(字段名, 字段值)`，供容错字段提取函数复用。

#### `_first(value, *keys)`

按调用方给出的字段优先级，在嵌套响应中寻找第一个非空值。例如优先找 `bvid`，再找通用 `id`。

#### `_strings(value, *keys)`

从指定字段中递归收集 HTTP(S) URL，兼容字符串、列表以及包含 `url`/`src` 的对象，并执行去重。

#### `_nested(value, *path)`

按明确路径安全读取嵌套字典。路径中任一级不存在时返回 `None`，避免直接索引报错。

#### `detect_platform(url)`

根据 URL 域名识别六个平台，同时支持抖音、小红书和 Bilibili 的短链接域名。

#### `TikHubClient.__init__(settings, transport=None)`

创建带基础 URL、超时、Accept Header 和可选 Bearer Token 的异步 HTTP 客户端。`transport` 参数用于测试时注入 `MockTransport`。

#### `TikHubClient.close()`

关闭 TikHub HTTP 连接池。

#### `TikHubClient._request(method, path, params=None, json=None)`

统一发送 TikHub 请求：解析 JSON、处理 HTTP 错误、检查 TikHub 业务 `code`，成功时直接返回 `data`。

#### `TikHubClient.fetch_demo(name="wechat")`

调用 TikHub 免费固定样本。`douyin` 返回固定抖音视频，其余情况返回固定公众号文章，并立即归一化。

#### `TikHubClient.fetch_content(platform, url)`

按平台拉取单条完整内容：

- 抖音：通过分享链接获取作品详情。
- 小红书：有 `note_id + xsec_token` 时使用 Web V3；否则使用 App 图文接口，并在识别为视频或数据不足时回退到视频接口。
- Bilibili：获取视频详情，再尽量补拉播放地址。
- YouTube：提取 11 位视频 ID，获取详情和媒体流；必要时根据最合适的 `itag` 获取签名播放地址。
- 公众号：POST 文章 URL 获取精简文章详情。
- 知乎：识别回答或专栏文章 URL，并调用对应详情接口。

最后调用 `normalize_item()` 返回统一模型。播放流补拉失败不会丢弃已经获得的详情数据。

#### `TikHubClient.fetch_creator(platform, creator, limit)`

拉取博主最近内容列表：

- 抖音主页链接先转换成 `sec_user_id`。
- 小红书支持主页分享链接或 `user_id`。
- Bilibili 主页链接先转换成 UID。
- YouTube 频道链接先转换成 channel ID。
- 公众号要求 `gh_username`。
- 知乎同时拉取用户文章和回答后合并。

函数截取到 `limit` 条并将列表项初步归一化。完整详情由 `ReviewPipeline.analyze()` 逐项补拉。

#### `TikHubClient.fetch_captions(item, language)`

优先获取平台字幕。目前实现 YouTube 和 Bilibili：YouTube 请求纯文本字幕，Bilibili 从原始详情中提取 `aid/cid` 后拉取字幕。其他平台返回空字符串，随后由媒体层决定是否执行 ASR。

#### `_extract_items(data)`

从不同平台常见列表字段中提取内容对象，例如 `aweme_list`、`notes`、`videos`、`archives`、`articles` 和 `answers`。

#### `normalize_item(platform, data, source_url=None)`

归一化入口。确定有效根对象，提取标题、作者、ID、发布时间、正文、图片、视频、音频、内容类型、统计数据和标准来源 URL，构造 `ContentItem` 并保留原始响应。

#### `_extract_text(platform, root)`

提取正文。公众号优先读取 `content.article.full_text`；其他平台从 `content/text/desc/description/excerpt/summary` 中选择最长文本。

#### `_extract_images(platform, root)`

提取图片。公众号读取解析后的文章图片列表；其他平台从常见图片字段收集 URL，并过滤明显的视频地址。

#### `_extract_videos(platform, root)`

按平台选择视频流：

- 抖音优先 H.264、非 ByteVC1，并选择接近 1080p 的档位。
- YouTube 优先已获取的签名地址，其次选择带音轨的复用流，再回退到视频流。
- Bilibili 优先 `durl` 渐进式地址，再尝试 `play_url/baseUrl`。
- 其他平台从常见播放字段提取。

#### `_extract_audio(root)`

从 `audio_url` 或 `audioUrl` 字段收集独立音频地址。

#### `_kind(platform, root, images, videos)`

根据媒体和平台判断内容类型。存在视频或平台天然为 Bilibili/YouTube 时判为视频；公众号判为文章；知乎区分回答和文章；其余有图片时判为图文。

#### `_looks_like_video(url)`

通过扩展名和 URL 片段判断一个地址是否像视频或播放地址。

#### `_mime_stream_urls(value, require_audio)`

递归查找带 MIME 类型的视频格式，按与 720p 的距离排序。`require_audio=True` 时只返回同时包含音频能力的复用流。

内部 `collect(child)` 负责递归扫描字典和列表，并收集候选地址及分辨率排序值。

#### `_muxed_itag(value)`

当 YouTube 格式没有直接播放 URL 时，寻找包含视频和音频的格式 ID，优先最接近 720p 的 `itag`。

内部 `collect(child)` 负责递归发现符合条件的 YouTube 格式。

#### `_urls_from_named_list(value, list_key)`

寻找指定名字的列表字段，并从列表对象中提取 `url`。当前主要用于 Bilibili 的 `durl`。

#### `_canonical_url(platform, content_id, candidate)`

根据平台和内容 ID 生成稳定的标准内容 URL，例如抖音作品、Bilibili 视频、YouTube watch URL；无法生成时保留上游候选 URL。

#### `_youtube_video_id(url)`

从 `youtu.be`、普通 watch URL 或 Shorts URL 提取并校验 11 位 YouTube 视频 ID。

#### `_xiaohongshu_note_params(url)`

从小红书 `/explore/` 或 `/discovery/item/` URL 中提取笔记 ID，并从查询参数读取 `xsec_token`。

#### `_zhihu_content_id(url)`

识别知乎回答或专栏文章 URL，返回内容类型和数字 ID；其他知乎 URL 会抛出 `TikHubError`。

#### `_zhihu_user_token(value)`

从知乎用户主页 `/people/<token>` 中提取用户 token；传入的已经是 token 时原样返回。

#### `_caption_text(data)`

兼容字符串、对象和分段列表形式的字幕响应，优先寻找 `text/content/caption/subtitle/body`，并将字幕片段拼接成纯文本。

### 2.5 `app/media.py`

媒体处理核心模块。负责安全下载、图片准备、视频抽帧、音轨转换、ASR 和临时文件生命周期。

#### `MediaError`

下载限制、URL 安全检查、FFmpeg/ffprobe 执行失败时使用的统一异常。

#### `PreparedMedia`

媒体处理结果：本地文章图片、视频关键帧、字幕/ASR、是否实际使用 ASR、警告列表和临时目录。

#### `MediaProcessor.__init__(settings)`

创建支持重定向和长媒体读取超时的 HTTP 客户端；配置了 ASR Key 时，同时创建 `AsyncOpenAI` 兼容客户端。

#### `MediaProcessor.close()`

关闭媒体下载 HTTP 连接池。

#### `MediaProcessor.prepare(image_urls, video_urls, audio_urls, existing_transcript)`

媒体处理总入口：

1. 创建每任务独立临时目录。
2. 下载最多 `max_frames` 张图片，每张限制 20 MB。
3. 选择第一个视频地址，若无视频则选择第一个音频地址。
4. 下载媒体并在有 FFmpeg 时抽取关键帧。
5. 只有在没有平台字幕且配置了 ASR 时，才提取音轨并转写。
6. 单个图片或媒体失败记录 warning，尽量让总结继续执行。

#### `MediaProcessor.cleanup(prepared)`

当 `KEEP_MEDIA=false` 时，在线程中递归删除任务临时目录；保留媒体模式下不删除。

#### `MediaProcessor._download(url, destination, max_mb)`

验证 URL 是公网 HTTP(S)，流式下载到本地，先检查 `Content-Length`，再在读取过程中持续检查实际字节数，防止超过限制。

#### `MediaProcessor._extract_frames(source, work_dir)`

调用 `ffprobe` 获取时长并计算自适应间隔，然后调用 FFmpeg 按时间顺序输出 `frame-001.jpg` 等文件。限制帧数、图像尺寸和 JPEG 质量，最终返回排序后的路径。

#### `MediaProcessor._transcribe(audio)`

将音频文件发送到 OpenAI-compatible `/audio/transcriptions`，使用配置的 ASR 模型和纯文本响应格式。

#### `_run(*args)`

异步执行 FFmpeg 等外部命令。标准输出丢弃，标准错误保留；命令失败时把最后 1000 字符包装为 `MediaError`。

#### `_probe_duration(source)`

使用 `ffprobe` 读取媒体总秒数。工具不存在、命令失败或输出无法解析时返回 `None`，让抽帧逻辑回退到配置间隔。

#### `_ensure_public_url(url)`

URL 安全检查：只允许 HTTP(S)，解析所有目标 IP，并拒绝私网、回环、链路本地、保留和组播地址。

#### `_url_suffix(url, default)`

从 URL path 推断受支持的图片/媒体扩展名；无法可靠判断时通过 MIME 猜测，再回退到调用方给定扩展名。

### 2.6 `app/reviewer.py`

负责 Claude 图片 OCR、关键帧理解和结构化内容总结。

#### `REVIEW_TOOL`

Claude tool-use Schema，强制模型返回与 `ReviewSummary` 对齐的字段，减少自由文本解析失败。

#### `Reviewer.__init__(settings)`

保存配置；只有存在 Anthropic API Key 时才创建异步 Claude 客户端。

#### `Reviewer.review(item, media, language)`

完整 review 入口：

1. 没有 Claude Key 时调用 `fallback_summary()`。
2. 合并文章图片和视频关键帧，并限制总数量。
3. 将本地图片编码成 Claude image block。
4. 拼装平台、类型、作者、正文、字幕/ASR、元数据和画面顺序。
5. 要求 Claude 基于证据执行 OCR、画面理解、时间线和风险分析。
6. 强制调用 `submit_content_review` 工具，并用 Pydantic 校验结果。

返回 `(ReviewSummary, 实际总结器名称)`。

#### `fallback_summary(item, media)`

无 Claude Key 时的本地降级逻辑。按中英文句末和换行拆分正文/字幕，生成简单概述、前五个要点、前两个引用、平台标签和降级风险。它不执行真正的图片 OCR 或视觉理解。

#### `_image_block(path)`

判断本地图片 MIME 类型，读取并 Base64 编码，生成 Anthropic Messages API 接受的图片内容块。

### 2.7 `app/pipeline.py`

业务编排层，将 TikHub、媒体处理和 Claude review 串成完整任务。

#### `ReviewPipeline.__init__(settings, tikhub=None)`

创建 TikHub 客户端、媒体处理器和 reviewer。测试可注入 mock TikHub 客户端。

#### `ReviewPipeline.close()`

关闭 TikHub 和媒体下载两个 HTTP 客户端。

#### `ReviewPipeline.analyze(request)`

生产分析主流程：

1. 确定平台。
2. 拉单条内容或博主内容列表。
3. 博主列表逐项补拉完整详情。
4. 媒体分析开启时优先拉平台字幕。
5. 下载图片/视频、抽帧并按需 ASR。
6. 调用 reviewer。
7. 生成 `ProcessingTrace`，按请求决定是否保留 raw。
8. 始终清理临时文件。

单条失败写入 `errors`，不会中止同批其他内容。

#### `ReviewPipeline.demo(name="wechat")`

运行 TikHub 固定公众号或抖音样本，同时实际走图片下载/视频抽帧和 reviewer，用于在没有 TikHub Key 时验证链路。

#### `_resolve_platform(request)`

优先使用显式平台；平台为 `auto` 时从内容 URL 或博主 URL 识别。博主只传平台 ID 时无法从域名识别，因此要求显式指定平台。

### 2.8 `app/main.py`

FastAPI 应用和 HTTP 路由入口。

#### `lifespan(app)`

服务启动时创建单例 `ReviewPipeline`，关闭时释放 HTTP 连接池。

#### `health()`

`GET /health`，报告 API 配置和 FFmpeg 可用状态。

#### `analyze(payload, request)`

`POST /v1/analyze`，调用生产分析流程。可预期的 `TikHubError` 转换为 HTTP 422。

#### `demo(request, sample)`

`POST /v1/demo`，运行 `wechat` 或 `douyin` 固定样本。TikHub Demo 失败时返回 HTTP 502。

### 2.9 `app/cli.py`

命令行入口，安装项目后对应 `social-review` 命令。

#### `_run(args)`

根据子命令运行 Demo 或构造 `AnalyzeRequest` 执行正式分析，以格式化 JSON 输出结果，并保证结束时关闭流水线。

#### `main()`

定义 argparse 命令：

- `demo --sample wechat|douyin`
- `analyze --url ...`
- `analyze --creator ... --platform ... --max-items ...`
- `--no-media` 跳过图片、字幕、ASR 和视频处理。

最后启动异步 `_run()`。

## 3. 测试代码

### 3.1 `tests/test_pipeline.py`

#### `test_fallback_summary_uses_source_text()`

验证无 Claude 时 fallback 能按英文句子生成要点，并明确标记降级风险。

#### `test_content_pipeline_without_keys()`

使用 `httpx.MockTransport` 模拟知乎回答详情，验证自动平台识别、完整 pipeline、无媒体模式和 fallback 总结。

内部 `handler(request)` 校验请求路径并返回固定 TikHub 风格 JSON。

### 3.2 `tests/test_tikhub.py`

#### `test_detect_platform(url, platform)`

参数化验证六个平台及短链接域名识别。

#### `test_normalize_wechat_article()`

验证公众号标题、作者、正文、图片和文章类型归一化。

#### `test_normalize_douyin_video_prefers_video_stream()`

验证同时存在 H.265 4K 和 H.264 1080p 时优先选择兼容的 1080p 视频流。

#### `test_demo_response_is_normalized()`

验证公众号 Demo 响应能够归一化。内部 `handler(request)` 模拟 TikHub Demo API。

#### `test_xiaohongshu_url_uses_web_v3_when_token_is_present()`

验证带 `note_id` 和 `xsec_token` 的小红书链接使用 Web V3 详情端点，并传递正确参数。内部 `handler(request)` 校验请求。

#### `test_youtube_fetches_signed_muxed_stream()`

模拟 YouTube 详情、格式列表和签名 URL 三次请求，验证系统选择最接近 720p 的带音频格式。内部 `handler(request)` 根据请求路径返回不同响应。

#### `test_unknown_platform()`

验证未知域名会抛出 `TikHubError`。

## 4. 项目配置和说明文件

### `pyproject.toml`

Python 项目定义：包名、Python 版本、运行依赖、测试依赖、`social-review` CLI、Hatchling 构建规则和 pytest 配置。

### `.env.example`

环境变量模板，覆盖 TikHub、Claude、ASR 和媒体处理参数。真实密钥应写入本地 `.env`，不要提交。

### `.gitignore`

忽略密钥、虚拟环境、Python 缓存、媒体临时目录，以及预留 iOS 工程的构建和用户状态文件。

### `README.md`

面向使用者的快速说明，包含处理链路、启动命令、API 示例、平台 ID 类型、输出结构和验证命令。

### `.swiftformat`

未来 Swift/iOS 代码的 SwiftFormat 规则，目前不参与 Python 服务运行。

### `.swiftlint.yml`

未来 `ios/` 目录的 SwiftLint 规则，目前不参与 Python 服务运行。

## 5. 运维和辅助脚本

### `scripts/verify-ios-environment.sh`

检查完整 Xcode、SDK、Simulator Runtime、可用模拟器和 Swift 版本。脚本没有自定义 Shell 函数，按顺序执行检查；缺少 Xcode 时以状态码 2 退出。

### `scripts/setup-ios-simulator.sh`

选择完整 Xcode、执行首次初始化、下载 iOS Runtime、选择 iPhone 设备类型、创建或复用 `AdventureX iPhone` 模拟器并启动 Simulator。脚本内嵌 Python 用 JSON 解析选择最新可用 iOS Runtime。

### `docs/apple-development-setup.md`

Apple 开发环境安装说明，与当前 Python 内容处理服务相互独立。

## 6. 非代码资料

| 文件 | 用途 |
| --- | --- |
| `Adventure-X.xlsx` | 活动/赛道相关资料，不参与服务运行 |
| `81ef3432186ba04d891e9f857024b3a6.jpg` | 产品界面参考图，不参与服务运行 |
| `image_exa.zip` | 图片示例压缩包，不参与服务运行 |

## 7. 修改需求时应从哪里开始

| 需求 | 首要修改文件 | 常见关联文件 |
| --- | --- | --- |
| 改抽帧数量、间隔、尺寸 | `app/media.py` | `app/config.py`、`.env.example` |
| 换 ASR 服务或模型 | `app/media.py` | `app/config.py` |
| 调整 Claude prompt 或输出字段 | `app/reviewer.py` | `app/models.py` |
| 增加平台或修复 TikHub 字段 | `app/tikhub.py` | `app/models.py`、测试 |
| 改批处理/错误降级逻辑 | `app/pipeline.py` | `app/models.py` |
| 增加 HTTP 接口 | `app/main.py` | `app/models.py` |
| 增加命令行参数 | `app/cli.py` | `app/models.py` |

