# 截图 OCR 回归结果

测试环境：Apple Silicon arm64、Python 3.9、PaddlePaddle 3.3.1、PaddleOCR 3.7.0、PP-OCRv5 mobile 检测/识别模型。

## 推荐路径

在 iOS 端优先使用 `拾贝/拾贝/Services/ImageOCR.swift` 的 Apple Vision。对同样两张截图，`VNRecognizeTextRequest` 的 `.accurate` 模式耗时约 0.65–1.09 秒，并完整识别账号和标题；`.fast` 模式更快但会漏掉标题关键字。它不需要网络请求或 Python 模型加载，满足 2 秒目标。后端接口接受 `ocrText`/`ocrLines`，因此 Vision 识别后不再重复上传图片给 OCR。

## 结果

| 图片 | 目标字段 | Paddle mobile | Tesseract |
|---|---|---:|---:|
| `image.jpg` | 巫师财经；全球股市年度排名，谁是神，谁是史，2025年策略前瞻 | 15.2s，账号和标题完整 | 3.9s，主要标题可读 |
| `image3.jpg` | 巫师财经；财经跨年：中国财经年度盘点Top10 | 12.2s，账号和标题完整 | 1.3s，标题丢失 |
| `image2.jpg` | 巫师财经；春晚背后资本博弈，第二季 | 15.0s，账号和标题完整 | 1.7s，账号和主视频字幕部分丢失 |

Apple Vision `.accurate`：`image3.jpg` 0.65s，`image2.jpg` 1.09s；两张均命中主标题。

Paddle 的时间包含每次启动 Python、加载已缓存模型和推理；首次下载模型不计入上表。Tesseract 速度快，但 `image3.jpg` 无法稳定识别主标题，因此当前默认使用 Paddle，失败才降级到 Tesseract。若后续需要极低延迟，可将 `OCR_PROVIDER=tesseract`，但应在搜索命中率监控下使用。

## 业务结论

搜索只要求账号 + 主标题，不要求识别全部 UI。`backend/src/flow/index.js` 会优先选择带 `【】`、`Top10`、`年度盘点`、`资本博弈` 等标题标记的 OCR 行，过滤时间、评论和广告文字。两张新增图片均可构造稳定检索词：

- `巫师财经 【巫师】财经跨年：中国财经年度盘点Top10`
- `巫师财经 【巫师】春晚背后资本博弈，第二季`

PaddleOCR 的关闭方向分类、文档矫正和文本行方向模型的配置依据官方 OCR Pipeline 文档：[PaddleOCR OCR Pipeline](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/pipeline_usage/OCR.html)。
