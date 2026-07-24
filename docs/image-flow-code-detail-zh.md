# 截图内容链路逐函数说明

本文说明当前截图收藏主链路的真实实现。代码入口集中在
[`backend/src/flow/`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/)，但来源提取器和题目生成器仍然复用后端的生产模块。

## 1. 总体链路

```text
iOS 截图
  │
  ├─ Apple Vision OCR：ImageOCR.recognize(_:)
  │        └─ creator/title/keyText/lines
  │
  └─ POST /api/sources/image-flow
           │
           ▼
      runImageFlow(options)
           │
           ├─ 1. 接收 iOS OCR；没有 OCR 时调用 recognizeImage(imagePath)
           ├─ 2. buildSearchQuery：去掉 UI 噪声，保留标题/账号/主题
           ├─ 3. searchLinks：默认 TikHub 平台搜索，可选通用 Web 搜索
           ├─ 4. pickCandidate：选择最可能的来源链接
           ├─ 5. isVideoUrl：区分视频链接和文章链接
           ├─ 6. extractSourceContent：文章、公众号、抖音、小红书、B站、YouTube
           ├─ 7. generateQuickReviewPath：一次模型调用生成摘要和 3 道题
           └─ 8. 返回 completed；取源失败时保留链接并降级生成
```

生产 HTTP 入口在
[`backend/src/server.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/server.js:245)，路由是
`POST /api/sources/image-flow`。iOS 客户端在
[`APIClient.swift`](/Users/liqingsong/Desktop/advx/AdventureX-2026/拾贝/拾贝/Services/APIClient.swift:121)
只传 `ocrText`、`ocrLines` 和可选 `sourceUrl`，因此生产路径不会在服务端重复识别同一张图。

## 2. `index.js`：主编排器

文件：[`backend/src/flow/index.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/index.js)

### `runImageFlow(options)`

这是完整链路的唯一编排函数。参数如下：

| 参数 | 作用 |
|---|---|
| `imagePath` | 服务端本地图片路径，仅开发/CLI 使用 |
| `imageBase64` | HTTP 上传的 base64 图片；函数会写入 `/tmp` 临时文件 |
| `ocrText` | iOS Vision 已识别的关键文本 |
| `ocrLines` | iOS Vision 的逐行文本，用于构造更好的搜索词 |
| `sourceUrl` | 用户复制的精确链接；存在时跳过搜索 |
| `searcher` | 默认 `searchLinks`，测试时可注入假搜索器 |
| `ocr` | 默认 `recognizeImage`，测试时可注入 OCR 实现 |
| `extract` | 默认 `extractSourceContent`，测试时可注入内容提取器 |
| `generate` | 默认 `generateQuickReviewPath`，测试时可注入模型函数 |

函数执行顺序：

1. `imagePath` 优先；没有路径但有 `imageBase64` 时调用 `materializeImage` 落盘。
2. 如果没有图片和 `ocrText`，抛出 `缺少截图内容或 OCR 文本。`。
3. 如果有 `ocrText`，把 provider 标为 `apple-vision`，不再调用服务端 OCR；否则调用 `ocr(path)`。
4. 对 OCR 行调用 `buildSearchQuery`。
5. 有 `sourceUrl` 时构造一个 `input` 搜索结果；没有时调用搜索服务。
6. 通过 `pickCandidate` 选择第一个排序后的候选。
7. 没有候选时返回 `ocr_completed` 或搜索服务的错误状态，例如 `search_provider_missing`。
8. 通过 `isVideoUrl` 把来源分成 `video_link` 或 `article_link`。
9. 调用 `extract` 获取标题、账号、正文、平台和 blocks。
10. 调用 `generate` 生成摘要、标签和题目，成功后返回 `status: "completed"`。
11. 来源提取失败时设置 `sourceFallback: true`，保留候选链接，并用“候选标题 + 摘要 + OCR 文本”降级生成；这样不会因为平台页面暂时打不开而丢失收藏。

注意：模型生成失败不会被这个函数吞掉，会由 HTTP 层转换成 422；来源提取错误才有降级分支。

### `buildSearchQuery(input)`

把 OCR 文本压缩为搜索引子：

- 将数组或换行文本统一成行。
- 合并空白，删除长度小于 2 的行。
- 删除时间戳，例如 `18:35`。
- 删除纯 UI 行，例如“简介、评论、收藏、播放、点赞、正在看”。
- 优先保留包含 `【】`、`Top10`、年度盘点、资本博弈、股市、策略等词的标题。
- 提升“巫师财经、哔哩哔哩、B站”等账号/平台行的权重。
- 最多返回 4 条强标题/账号/主题行，总长度最多 180 字。
- 如果没有强特征，按 `scoreLine` 排序后取前 6 行。

当前实现是规则型查询构造，不调用模型，延迟稳定且便于调试。

### `uniqueLines(lines)`

去除空行和重复行，保持首次出现顺序。

### `scoreLine(line, index)`

给普通 OCR 行打分：行越靠前基础分越高；包含平台、财经、全球、投资等词加分；数字开头的行扣分。

### `pickCandidate(results, query)`

把搜索结果数组排序并返回一个候选。目前当查询包含“哔哩/B站/巫师财经”时，会对 URL 中含 `bilibili` 的结果加分；没有结果时返回 `null`。

### `platformScore(item, platform)`

候选 URL 平台加分的内部函数，当前只实现 Bilibili 加分。

### `materializeImage(imageBase64)`

移除 data URL 前缀，将 base64 写入 `/tmp/shibei-image-<timestamp>.jpg`，返回临时路径。当前函数没有在链路结束后主动删除临时文件，适合后续增加 finally 清理。

## 3. `ocr.js` / `ocr.py`：服务端 OCR 备用方案

### `ocr.js`

文件：[`backend/src/flow/ocr.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/ocr.js)

#### `recognizeImage(imagePath, options)`

- 默认 Python 解释器：`.runtime/paddle-ocr/bin/python`。
- 如果该路径不存在，退回 `python3`。
- Python 脚本固定为同目录的 `ocr.py`。
- 默认超时 45 秒，可由 `OCR_TIMEOUT_MS` 覆盖。
- 返回统一结构：`provider`、`text`、`lines`、`latencyMs`、`fallback`。

#### `runJsonProcess(command, args, options)`

通过 `child_process.spawn` 启动 Python 子进程：

- stdout/stderr 分开收集。
- 超时后发送 `SIGKILL`，错误码为 `ocr_timeout`。
- 子进程找不到时转换为 `ocr_runtime_missing`。
- 只读取 stdout 最后一行 JSON，允许 OCR 依赖打印普通日志。
- 非 0 退出或 JSON 无法解析时抛出 `ocr_failed`。

#### `fileExists(path)`

使用 `fs/promises.access` 检查 Python 解释器是否存在。

#### `cleanText(value)`

删除控制字符、合并连续空格并去除首尾空白，保证 OCR 输出适合搜索。

### `ocr.py`

#### `emit(payload)`

将结果以 UTF-8 JSON 打到 stdout，并立即 flush，供 Node 读取。

#### `tesseract(path)`

调用系统 `tesseract`，默认语言为 `chi_sim+eng`，也可通过 `TESSERACT_BIN`、`TESSERACT_LANG` 配置。它是低依赖、低延迟兜底，但中文标题精度低于 Paddle/Apple Vision。

#### `paddle(path)`

使用 PaddleOCR PP-OCRv5 mobile：

- 关闭文档方向分类、去畸变和文本行方向模型，减少延迟。
- 只裁剪图片上方 62%，聚焦平台标题和账号。
- 宽度超过 960 像素时缩放到 960。
- 兼容 PaddleOCR 返回对象、JSON 字符串、`res` 包装和数组格式。
- 从 `rec_texts`/`text`/`texts` 读取文字行。

#### `main()`

读取第一个命令行参数作为图片路径。`OCR_PROVIDER` 不是 `paddle`/`paddleocr` 时直接走 Tesseract；默认先走 Paddle，Paddle 异常后自动走 Tesseract。两者都失败时返回 `ocr_failed`。

## 4. `search.js`：搜索链接

文件：[`backend/src/flow/search.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/search.js)

### `searchLinks(query, options)`

搜索提供商选择优先级：

1. `SEARCH_API_URL`：调用显式配置的自定义兼容接口。
2. `TIKHUB_API_KEY`：调用 TikHub 的 Bilibili、抖音或小红书站内搜索。
3. `TAVILY_API_KEY`：可选的普通 Web 搜索兜底。
4. `SERPER_API_KEY`：可选的普通 Web 搜索兜底。
5. 都没有时返回 `search_provider_missing`，不伪造链接。

默认最多 5 条结果，默认超时 8 秒，可由 `SEARCH_TIMEOUT_MS` 覆盖。

### `callTikHub(query, options)`

根据 OCR 查询中的平台词选择 TikHub endpoint；明确识别平台时只请求一个平台，无法判断时并行请求 Bilibili、抖音和小红书。允许部分平台失败，对 URL 去重后最多返回 `maxResults` 条。

### `callTikHubPlatform(platform, query, options)`

- Bilibili：GET `/api/v1/bilibili/web/fetch_general_search`。
- 小红书：GET `/api/v1/xiaohongshu/web_v3/fetch_search_notes`。
- 抖音：POST `/api/v1/douyin/search/fetch_general_search_v2`。

所有请求都使用 `Authorization: Bearer <TIKHUB_API_KEY>`。

### `detectTikHubSearchPlatforms(query)`

根据“哔哩/B站/bilibili”“小红书/xhs”“抖音/douyin”等词判断目标平台。没有平台词时返回三个平台，由 `callTikHub` 并行搜索。

### `normalizeTikHubResults` / `findTikHubItems` / `normalizeTikHubItem`

兼容 TikHub 对不同平台的响应包装，将 BVID、抖音 aweme id、小红书 note id 转换成可交给 `source.js` 的公开链接，并统一为 `{ title, url, snippet }`。

### `stripHtml(value)` / `cleanValue(value)`

Bilibili 搜索标题可能包含关键词 `<em>` 标签；`stripHtml` 删除标签，`cleanValue` 统一字符串空值和首尾空白。

### `callTavily(query, options)`

向 `https://api.tavily.com/search` 发 POST，传入 API key、查询词、数量和 `basic` 搜索深度，之后交给 `normalizeResults`。

### `callSerper(query, options)`

向 `https://google.serper.dev/search` 发 POST，通过 `x-api-key` 传 key，读取返回的 `organic` 结果。

### `callGenericSearch(query, options)`

向 `SEARCH_API_URL` 发 POST，body 为 `{ query, max_results }`。如果配置了 `SEARCH_API_KEY`，以 Bearer 方式发送。兼容响应字段 `results`、`organic` 或 `data`。

### `requestJson(url, options)`

统一处理 AbortController 超时、HTTP 状态和 JSON 解析。非 2xx 响应会抛出包含服务端 message 的错误。

### `normalizeResults(provider, query, items)`

将不同搜索服务转换为统一结构：

```json
{
  "provider": "tavily",
  "query": "原始查询",
  "results": [{ "title": "标题", "url": "https://...", "snippet": "摘要" }]
}
```

只保留 `http`/`https` URL。

## 5. `source.js`：来源提取适配层

文件：[`backend/src/flow/source.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/source.js)

这个文件故意很薄，只导出：

- `extractSourceContent`：来自 `sources/extractSourceContent.js`。
- `isVideoUrl`：来自同一模块。

这样 `index.js` 只依赖 `flow/` 内的稳定边界；平台提供商仍由 `media/` 负责，避免把 TikHub、yt-dlp、ASR 和缓存实现复制到编排目录。

### `extractSourceContent(input, options)`

真实实现位于
[`backend/src/sources/extractSourceContent.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/sources/extractSourceContent.js:8)：

- `sourceType=text`：直接清洗并返回用户文字。
- `sourceType=video_link`：调用 `extractVideoLearningSource`，再用 `buildV2SourceFromLearningSource` 统一成标题、账号、正文 blocks 和平台。
- `sourceType=article_link`：先校验 URL；公众号走公众号提取器，其他网页走普通 HTML 提取器。
- 其他类型抛出 `failed_extract_article`。

### `isLikelyUrl(value)`

使用 `URL` 解析，只接受 `http:` 或 `https:`。

### `isVideoUrl(value)`

识别 Bilibili、B23、YouTube、抖音、小红书以及 `.mp4/.mov/.m4v/.webm/.m3u8` 文件链接。

### `normalizeUrl(value)`

文章提取前校验 URL，非法输入转换成统一来源错误。

### `isWechatArticleUrl(value)`

判断 hostname 是否为 `mp.weixin.qq.com`。

### `extractWebArticle(sourceUrl)`

使用 fetch 抓取 HTML，带浏览器 User-Agent、重定向和超时；只接受 HTML/XHTML，交给 `extractArticleFromHtml`，正文不足 200 字则失败。

### `extractWechatArticle(sourceUrl)`

先走静态抓取；失败时动态导入 Playwright，访问公众号页面并读取标题、账号和 `#js_content`。动态路径有整体超时，finally 中关闭浏览器。

### `extractWechatArticleFromStaticHtml(sourceUrl)`

公众号的快速 HTTP 路径；静态 HTML 能拿到足够正文时不启动浏览器。账号缺失时调用 `inferWechatAccount` 猜测。

### `extractArticleFromHtml(html, sourceUrl)`

删除 script/style/noscript/comment 噪声，按 `og:title`、title meta、`<title>` 取得标题，优先读取 `<article>`、`<main>` 或 `<body>`，最后转成纯文本。

### `htmlToText(html)`

把段落、标题、列表、引用和换行标签转换成换行，再删除其他 HTML 标签。

### `cleanExtractedText(text)`

清理回车、行内多余空格和连续空行。

### `decodeHtml(value)`

解码常见 HTML 实体，包括十进制和十六进制数字实体。

### `firstMatch(text, pattern)`

返回正则第一个捕获组，没有匹配时返回空字符串。

### `ensureArticleText(rawText)`

正文少于 200 字时抛出 `failed_extract_article`，阻止模型基于空壳页面出题。

### `inferWechatAccount(rawText)`

从公众号正文附近的 MetaTown、公众号、原创等标记中寻找可能的账号名。

### `sourceFailure(status, message)`

生成带 `code` 和 `status` 的统一 Error 对象。

### `withTimeout(promise, timeoutMs, message)`

为 Playwright 或浏览器关闭动作增加 Promise 超时。

### `readPositiveInt(value, fallback)`

解析正整数环境变量，否则返回默认值。

## 6. TikHub、B站和 YouTube 的实际取源

截图主链路识别到视频后，会进入
[`extractVideoLearningSource.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/media/extractVideoLearningSource.js:39)。平台选择由
[`videoPlatforms.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/media/videoPlatforms.js:32) 完成：

| 平台 | provider | 说明 |
|---|---|---|
| 抖音 | TikHub | 分享链接 API，返回视频地址、标题、作者、封面和时长 |
| 小红书 | TikHub | 笔记详情 API，返回视频地址、作者、封面、时长和可能的字幕 |
| B站 | yt-dlp | 不走 TikHub；使用通用视频取源/字幕/ASR |
| YouTube | yt-dlp | 不走 TikHub；使用通用视频取源/字幕/ASR |

### `fetchTikHubVideoSource(options)`

文件：[`backend/src/media/tikhubVideoProvider.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/media/tikhubVideoProvider.js:12)

1. `normalizeVideoSourceUrl` 校验 URL。
2. `detectVideoPlatform` 判断抖音或小红书。
3. `isTikHubPreferredPlatform` 拒绝 B站、YouTube 等非 TikHub 平台。
4. 读取 `TIKHUB_API_KEY` 和 `TIKHUB_BASE_URL`。
5. 抖音调用：`/api/v1/douyin/app/v3/fetch_one_video_by_share_url?share_url=...`。
6. 小红书调用：`/api/v1/xiaohongshu/app_v2/get_video_note_detail?share_text=...`。
7. 统一返回 provider、platform、providerContentId、title、description、account、sourceUrl、mediaUrl、coverUrl、durationSeconds。

### TikHub 内部函数

- `buildEndpoint`：按平台构造 API endpoint 和 query 参数。
- `fetchJsonWithTimeout`：Bearer 鉴权、AbortController 超时、HTTP 429/5xx 错误分类。
- `normalizeDouyinPayload`：从 `aweme_detail` 读取视频 URL、描述和作者。
- `normalizeXiaohongshuPayload`：从 `note_card`/`video_info_v2` 读取视频流、图片、作者、时长和字幕。
- `mediaUnavailable`：没有媒体地址时生成不可重试错误。
- `firstString`、`firstNumber`、`stringValue`：兼容不同供应商字段形状。
- `millisToSeconds`、`firstDurationSeconds`：统一时长单位。
- `readPositiveInt`：读取正整数超时配置。

### TikHub 环境变量

`backend/.env.example` 中声明了：

```env
TIKHUB_API_KEY=...
TIKHUB_BASE_URL=https://api.tikhub.io
```

实际运行时由 `backend/src/env.js` 加载 `backend/.env`；`.env.example` 不会被运行时自动加载，并且应当只保留占位符。真实 key 应放入未提交的 `backend/.env` 或部署平台环境变量。若当前 `.env.example` 已经填入真实 key，应立即迁移并轮换泄露的 key。

## 7. `review.js`：总结和题目适配层

文件：[`backend/src/flow/review.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/review.js)

该文件导出 `generateQuickReviewPath`，真实实现位于
[`quickReviewGenerator.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/v2/generation/quickReviewGenerator.js:39)。

### `generateQuickReviewPath(article, options)`

执行一次快速生成：

1. `buildSource` 将 rawText 或 blocks 统一成来源块。
2. `selectTextWindow` 限制输入长度，保留开头、中间、结尾。
3. `fingerprint` 生成缓存 key。
4. 先读 TTL/LRU 缓存，再合并相同内容的 in-flight 请求。
5. 没有缓存时调用 `callQuickReviewModel`，默认只进行一次模型请求。
6. `assembleReviewPath` 转换成现有 V2 review contract。
7. `validateReviewPathV2` 校验结构，不合格就抛错。
8. 通过 `emitV2GenerationProgress` 上报生成阶段。

### `callQuickReviewModel(context)`

构造最短 prompt，要求模型：

- 只依据来源内容。
- 摘要 2-4 句中文。
- 1 道判断题 + 2 道四选一。
- 判断题选项固定为“正确/错误”。
- 选择题必须 4 个选项，答案唯一。
- 解释不超过 60 个汉字。

模型调用使用 `callModelJson`，并传入 `QUICK_REVIEW_OUTPUT_SCHEMA`。

### `normalizeGeneratedReview(output, article, source)`

清理模型的标题、摘要、标签和题目；有效题目少于 3 道时失败。

### `normalizeQuestion(question)`

将题目标准化为 `type/prompt/options/correctIndex/explanation`，检查选项数量、答案下标和必填文本。

### `assembleReviewPath(article, source, generated, meta)`

将简化模型结果转换为 V2 结构：`source`、`summaryCard`、`units`、`questions`、`chapterSummary` 和 `generationMeta`。

### `buildSource(article)`

优先使用 `article.source.blocks`，其次使用 `article.blocks`，最后把 rawText 按换行拆成 paragraph blocks；同时整理标题、作者、账号、URL、平台和内容依据。

### `selectTextWindow(text, limit)`

超过默认 12,000 字时，用“头 45% + 中间 20% + 尾部”压缩，并插入 `[中间内容已压缩]` 标记，避免超出模型上下文。

### `fingerprint({ source, boundedText })`

使用 SHA-256 对 prompt 版本、URL、标题和压缩文本做指纹，保证同一内容复用缓存。

### `readResultCache(key, ttlMs)` / `writeResultCache(key, value, maxEntries)`

实现进程内 TTL + LRU 缓存；读取命中后刷新 LRU 顺序，写入超过上限时删除最旧项。

### `uniqueStrings(values, limit)` / `cleanText(value)` / `readPositiveInt(value, fallback)`

分别用于去重截断字符串、清理空白和读取正整数配置。

## 8. `cli.mjs`：本地完整链路入口

文件：[`backend/src/flow/cli.mjs`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/cli.mjs)

执行逻辑只有三步：

1. 加载 `env.js`。
2. 从第一个参数读取图片路径，默认 `image.jpg`；从任意 `http` 参数读取可选精确链接。
3. 调用 `runImageFlow`，将完整 JSON 打印到 stdout。

运行：

```bash
npm --prefix backend run image-flow -- image3.jpg
npm --prefix backend run image-flow -- image3.jpg https://example.com/original-link
```

不传精确链接时只需在实际运行环境配置 `TIKHUB_API_KEY`；不需要额外的 Tavily/Serper key。传入精确链接时会跳过所有搜索，但仍会执行来源提取和题目生成。

## 9. `index.test.js`：链路测试

文件：[`backend/src/flow/index.test.js`](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/index.test.js)

### `builds a compact query from account and title OCR lines`

注入时间、账号、标题和 UI 行，断言查询保留“巫师财经”和标题，删除 `18:35`。这个测试验证规则型 OCR 清洗不会把搜索重点丢掉。

### `returns OCR/search result without a search provider`

注入假的 OCR 和返回 `search_provider_missing` 的搜索器，断言链路状态可诊断、查询仍然保留账号。这个测试避免在单元测试中调用真实搜索网络。

测试命令：

```bash
npm --prefix backend run check
```

## 10. 状态与故障处理

| 状态/字段 | 含义 |
|---|---|
| `ocr_completed` | 已识别，但没有候选链接或尚未配置搜索 |
| `search_provider_missing` | 没有配置搜索接口/key |
| `completed` | 已完成来源提取和摘要/题目生成 |
| `sourceFallback: true` | 原站取源失败，使用搜索摘要和 OCR 文本降级生成 |
| `failed` | 输入、OCR、搜索或模型发生不可恢复错误，HTTP 层返回 422 |

当前链路的实际边界是：OCR 负责找“标题 + 账号”，搜索负责找“候选链接”，TikHub/yt-dlp/文章提取负责拿“原始内容”，模型只负责把原始内容压缩成“摘要 + 练习”。模型不会承担图片 OCR，也不应该直接猜平台链接。
