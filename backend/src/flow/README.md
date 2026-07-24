# Screenshot-to-review flow

This directory is the single orchestration boundary for the screenshot flow:

`screenshot -> Qwen vision identity -> strict Bilibili match -> transcript -> core review + video overview`

## Files

- `index.js`: orchestrates the complete flow and exposes `runImageFlow`.
- `vision.js`: sends the original screenshot to the configured Qwen vision model and returns a bounded source identity.
- `search.js`: searches Bilibili through TikHub and normalizes link candidates. Douyin/Xiaohongshu adapters remain disabled extension points.
- `source.js`: stable adapter to the existing article/video platform extractors.
- `review.js`: stable adapter to the fast one-call summary and question generator.
- `cli.mjs`: local command-line entry for end-to-end testing.
- `index.test.js`: flow orchestration and search-query tests.

The iOS client sends compressed JPEG/PNG/WebP bytes to this flow. The production
path does not invoke Apple Vision, PaddleOCR, or Tesseract. `ocrText` remains a
test/development compatibility input and is not the app's primary path.

## Video behavior

The flow only exposes the screenshot identity (`title`, `account`, and an explicit
player timestamp). It rejects a weak title match instead of summarizing an unrelated
video. One full transcript powers two output sections:

- `review`: cards and a core summary from the timestamp window, or from visible screenshot terms
  matched against timestamped transcript blocks when the player time is absent.
- `videoOverview`: a short whole-video summary and highlights from the full transcript.

Subtitle tracks are always preferred. Bilibili uses its public subtitle metadata
before a fallback. For videos without captions, TikHub supplies the Bilibili DASH
audio stream, avoiding a direct yt-dlp scrape. `qwen3-asr-flash-filetrans` first
tries that stream directly. If the source CDN blocks Qwen, production deployments
with `SHIBEI_PUBLIC_BASE_URL` download the audio once, create a random short-lived
`/api/asr-media/<token>` URL, and revoke it after the task. The installed local
`faster-whisper` fallback is for local development or background work on long
videos, not a seconds-level request.

`CAPTURE_PLATFORMS=bilibili` is the production default. Enabling another adapter
requires adding that platform to the environment value and passing its own
integration tests; retaining adapter code does not mean the product currently
claims support for it.
