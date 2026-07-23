from __future__ import annotations

from app.config import Settings
from app.media import MediaProcessor, PreparedMedia
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    ItemResult,
    Platform,
    ProcessingTrace,
)
from app.reviewer import Reviewer
from app.tikhub import TikHubClient, TikHubError, detect_platform


class ReviewPipeline:
    def __init__(self, settings: Settings, tikhub: TikHubClient | None = None):
        self.settings = settings
        self.tikhub = tikhub or TikHubClient(settings)
        self.media = MediaProcessor(settings)
        self.reviewer = Reviewer(settings)

    async def close(self) -> None:
        await self.tikhub.close()
        await self.media.close()

    async def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        platform = _resolve_platform(request)
        if request.content_url:
            items = [await self.tikhub.fetch_content(platform, str(request.content_url))]
        else:
            items = await self.tikhub.fetch_creator(platform, request.creator or "", request.max_items)

        results: list[ItemResult] = []
        errors: list[str] = []
        for index, item in enumerate(items):
            try:
                # Creator feeds usually contain only summaries and covers; fetch the complete item before review.
                if not request.content_url and item.source_url:
                    try:
                        item = await self.tikhub.fetch_content(platform, item.source_url)
                    except TikHubError as exc:
                        errors.append(f"Item {index + 1} detail fallback: {exc}")

                captions = ""
                if request.analyze_media:
                    try:
                        captions = await self.tikhub.fetch_captions(item, request.language)
                    except TikHubError as exc:
                        errors.append(f"Item {index + 1} captions fallback: {exc}")

                if request.analyze_media:
                    prepared = await self.media.prepare(
                        item.images, item.videos, item.audio, captions or item.transcript
                    )
                else:
                    prepared = PreparedMedia(transcript=item.transcript)

                try:
                    summary, summarizer = await self.reviewer.review(item, prepared, request.language)
                    trace = ProcessingTrace(
                        used_platform_text=bool(item.text),
                        used_platform_captions=bool(captions),
                        used_asr=prepared.used_asr,
                        frame_count=len(prepared.frames),
                        image_count=len(prepared.images),
                        summarizer=summarizer,
                        warnings=prepared.warnings,
                    )
                    if not request.include_raw:
                        item.raw = None
                    item.transcript = prepared.transcript
                    results.append(ItemResult(item=item, summary=summary, trace=trace))
                finally:
                    await self.media.cleanup(prepared)
            except Exception as exc:
                errors.append(f"Item {index + 1} failed: {exc}")

        return AnalyzeResponse(platform=platform, results=results, errors=errors)

    async def demo(self, name: str = "wechat") -> AnalyzeResponse:
        item = await self.tikhub.fetch_demo(name)
        prepared = await self.media.prepare(item.images, item.videos, item.audio, item.transcript)
        try:
            summary, summarizer = await self.reviewer.review(item, prepared, "zh-CN")
            trace = ProcessingTrace(
                used_platform_text=bool(item.text),
                used_asr=prepared.used_asr,
                frame_count=len(prepared.frames),
                image_count=len(prepared.images),
                summarizer=summarizer,
                warnings=[
                    "Demo uses TikHub's fixed cached sample and does not consume a TikHub API key.",
                    *prepared.warnings,
                ],
            )
            item.raw = None
            item.transcript = prepared.transcript
            return AnalyzeResponse(platform=item.platform, results=[ItemResult(item=item, summary=summary, trace=trace)])
        finally:
            await self.media.cleanup(prepared)


def _resolve_platform(request: AnalyzeRequest) -> Platform:
    if request.platform != Platform.AUTO:
        return request.platform
    candidate = str(request.content_url) if request.content_url else request.creator or ""
    if not candidate.startswith("http"):
        raise TikHubError("platform is required when creator is a platform ID instead of a URL")
    return detect_platform(candidate)
