# 拾贝

拾贝用于收藏互联网上的碎片内容，并把它们变成几分钟内可完成的摘要与复习卡。

主链路只有一条：

```text
粘贴/分享链接或文字
  -> 提取文章正文或视频字幕
  -> 字幕缺失时才下载音频并 ASR
  -> 一次模型调用生成摘要、标签和 3 道练习
  -> iOS 完成判断题/选择题并记录错题
```

当前生产链路没有 Claude。截图流第一阶段只支持 B站：Qwen 视觉模型直接读取原图中的标题、UP主、字幕和播放位置；TikHub 严格核对来源后，字幕优先、ASR 兜底，分别生成截图附近的记忆卡和全片概览。其他平台 adapter 保留扩展边界，但默认不启用。

## 目录

- `拾贝/`：正式 SwiftUI iOS App。
- `backend/`：Node.js API、链接提取、视频字幕/ASR、模型生成和复习状态。
- `docs/`：产品、架构、隐私和发布文档。
- `tools/`：本地环境、iOS 和发布检查脚本。

核心文件说明见 [docs/codebase-guide-zh.md](docs/codebase-guide-zh.md)，架构与性能策略见 [docs/fragment-memory-architecture-zh.md](docs/fragment-memory-architecture-zh.md)。

## 本地运行

要求 Node.js 20+。视频 ASR 兜底还需要 `ffmpeg`、`yt-dlp` 和本地 Whisper 环境。

根目录 `.env` 或 `backend/.env`：

```dotenv
AI_PROVIDER=qwen
QWEN_API=replace_me
BASE_URL=https://example.com/v1
AI_MODEL=qwen3.7-plus-2026-05-26

# B站截图来源恢复
TIKHUB_API_KEY=
CAPTURE_PLATFORMS=bilibili
VIDEO_LINK_ENABLED=1

# 默认关闭。只有字幕无法表达关键画面时再显式开启。
VIDEO_VISUAL_ENABLED=0
```

环境变量优先级为系统环境变量、`backend/.env`、根目录 `.env`。真实密钥不得提交 Git。

```bash
npm --prefix backend install
npm run dev
npm run check
```

后端默认地址为 `http://127.0.0.1:5173`。正式 iOS 工程是 `拾贝/拾贝.xcodeproj`。

本地截图流程演示页是 `http://127.0.0.1:5173/demo`。上传原图后会调用同一个 `POST /api/sources/image-flow` 接口；图片直接发送给配置的 Qwen 视觉模型，不经过 Apple Vision 或 Paddle OCR。没有找到标题和 UP主均可信的 B站结果时，流程会停止，不会生成错误卡片。

部署后请设置 `SHIBEI_PUBLIC_BASE_URL=https://你的后端域名`。无字幕长视频时，后端会下载音频，生成一个仅供 Qwen ASR 读取的短期 HTTPS 地址；转写结束立即失效。本地 `localhost` 不会公开临时媒体，仍使用本地 Whisper 兜底。

## 性能目标

- 有平台字幕：不下载完整视频，不抽帧，直接进入模型生成。
- 无字幕：B站优先由 TikHub 提供音频流，Qwen 可直接读取时不下载；被平台 CDN 拒绝时才下载一次并 ASR。视觉理解默认关闭。
- 长文/长字幕：确定性保留头、中、尾，模型输入默认最多 12,000 字符。
- 摘要、标签、1 道判断题和 2 道选择题：一次模型请求完成，默认关闭 thinking。
- 相同内容：进程内 TTL/LRU 缓存，并合并同时到达的重复请求。

生产环境仍建议把结果缓存升级为 Redis/PostgreSQL 持久缓存，以便多 worker 共享。
