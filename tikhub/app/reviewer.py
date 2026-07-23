from __future__ import annotations

import base64
import json
import mimetypes
import re
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from app.config import Settings
from app.media import PreparedMedia
from app.models import ContentItem, ReviewSummary, TimelineEntry


REVIEW_TOOL: dict[str, Any] = {
    "name": "submit_content_review",
    "description": "Submit the final evidence-grounded content review.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "one_sentence",
            "overview",
            "key_points",
            "timeline",
            "visual_findings",
            "notable_quotes",
            "tags",
            "risks",
        ],
        "properties": {
            "one_sentence": {"type": "string"},
            "overview": {"type": "string"},
            "key_points": {"type": "array", "items": {"type": "string"}},
            "timeline": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["time", "event"],
                    "properties": {"time": {"type": ["string", "null"]}, "event": {"type": "string"}},
                },
            },
            "visual_findings": {"type": "array", "items": {"type": "string"}},
            "notable_quotes": {"type": "array", "items": {"type": "string"}},
            "tags": {"type": "array", "items": {"type": "string"}},
            "risks": {"type": "array", "items": {"type": "string"}},
        },
    },
}


class Reviewer:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key) if settings.anthropic_api_key else None

    async def review(self, item: ContentItem, media: PreparedMedia, language: str) -> tuple[ReviewSummary, str]:
        if not self.client:
            return fallback_summary(item, media), "fallback"

        blocks: list[dict[str, Any]] = []
        all_images = (media.images + media.frames)[: self.settings.max_frames]
        for index, path in enumerate(all_images, start=1):
            blocks.append({"type": "text", "text": f"Visual {index} ({path.name}):"})
            blocks.append(_image_block(path))

        context = {
            "platform": item.platform.value,
            "content_type": item.kind.value,
            "source_url": item.source_url,
            "title": item.title,
            "author": item.author,
            "published_at": item.published_at,
            "platform_text": item.text[:80000],
            "transcript_or_captions": media.transcript[:140000],
            "metadata": item.metadata,
            "visual_order": [path.name for path in all_images],
        }
        blocks.append(
            {
                "type": "text",
                "text": (
                    "Review this social-media content using only the supplied evidence. Images may be article "
                    "images or time-ordered video keyframes; read visible text (OCR) and describe relevant visuals. "
                    "Do not invent missing facts. Put unverifiable, promotional, disputed, or safety-sensitive claims "
                    "in risks. Quotes must be exact excerpts from platform text/transcript; otherwise return none. "
                    "For a video, infer a timeline only where captions or frame order support it. "
                    f"Write all review fields in {language}. Call submit_content_review exactly once.\n\n"
                    + json.dumps(context, ensure_ascii=False, default=str)
                ),
            }
        )
        response = await self.client.messages.create(
            model=self.settings.claude_model,
            max_tokens=4096,
            tools=[REVIEW_TOOL],
            tool_choice={"type": "tool", "name": "submit_content_review"},
            messages=[{"role": "user", "content": blocks}],
        )
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == REVIEW_TOOL["name"]:
                return ReviewSummary.model_validate(block.input), self.settings.claude_model
        raise RuntimeError("Claude did not return the required review tool result")


def fallback_summary(item: ContentItem, media: PreparedMedia) -> ReviewSummary:
    source = "\n".join(part for part in (item.text, media.transcript) if part).strip()
    sentences = [
        part.strip()
        for part in re.split(r"(?<=[。！？!?])\s*|(?<=[A-Za-z0-9][.!?])\s+|\n+", source)
        if part.strip()
    ]
    title = item.title or (sentences[0][:80] if sentences else "未提取到标题")
    key_points = sentences[:5]
    overview = " ".join(sentences[:3])[:800] if sentences else "已拉取平台元数据，但未获得可总结的正文或字幕。"
    warnings = list(media.warnings)
    if not source:
        warnings.append("缺少正文/字幕，当前结果仅用于验证采集链路。")
    return ReviewSummary(
        one_sentence=title,
        overview=overview,
        key_points=key_points,
        timeline=[],
        visual_findings=[f"已提取 {len(media.images)} 张图片和 {len(media.frames)} 个视频关键帧。"]
        if media.images or media.frames
        else [],
        notable_quotes=key_points[:2],
        tags=[item.platform.value, item.kind.value],
        risks=warnings or ["当前使用无模型 fallback 摘要，配置 ANTHROPIC_API_KEY 后可启用完整内容理解。"],
    )


def _image_block(path: Path) -> dict[str, Any]:
    media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": data},
    }
