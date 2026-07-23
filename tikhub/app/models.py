from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl, model_validator


class Platform(StrEnum):
    AUTO = "auto"
    DOUYIN = "douyin"
    XIAOHONGSHU = "xiaohongshu"
    BILIBILI = "bilibili"
    YOUTUBE = "youtube"
    WECHAT = "wechat"
    ZHIHU = "zhihu"


class ContentKind(StrEnum):
    VIDEO = "video"
    IMAGE_TEXT = "image_text"
    ARTICLE = "article"
    ANSWER = "answer"
    UNKNOWN = "unknown"


class AnalyzeRequest(BaseModel):
    platform: Platform = Platform.AUTO
    content_url: HttpUrl | None = None
    creator: str | None = Field(
        default=None,
        description="Creator URL or platform ID: sec_user_id, UID, channel ID, gh_username, etc.",
    )
    max_items: int = Field(default=5, ge=1, le=20)
    language: str = "zh-CN"
    analyze_media: bool = True
    include_raw: bool = False

    @model_validator(mode="after")
    def require_a_source(self) -> "AnalyzeRequest":
        if not self.content_url and not self.creator:
            raise ValueError("content_url and creator cannot both be empty")
        return self


class MediaAsset(BaseModel):
    url: str
    kind: str


class ContentItem(BaseModel):
    platform: Platform
    content_id: str | None = None
    kind: ContentKind = ContentKind.UNKNOWN
    source_url: str | None = None
    title: str = ""
    author: str = ""
    text: str = ""
    published_at: str | None = None
    images: list[str] = Field(default_factory=list)
    videos: list[str] = Field(default_factory=list)
    audio: list[str] = Field(default_factory=list)
    transcript: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    raw: dict[str, Any] | None = None


class TimelineEntry(BaseModel):
    time: str | None = None
    event: str


class ReviewSummary(BaseModel):
    one_sentence: str
    overview: str
    key_points: list[str] = Field(default_factory=list)
    timeline: list[TimelineEntry] = Field(default_factory=list)
    visual_findings: list[str] = Field(default_factory=list)
    notable_quotes: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class ProcessingTrace(BaseModel):
    used_platform_text: bool = False
    used_platform_captions: bool = False
    used_asr: bool = False
    frame_count: int = 0
    image_count: int = 0
    summarizer: str = "fallback"
    warnings: list[str] = Field(default_factory=list)


class ItemResult(BaseModel):
    item: ContentItem
    summary: ReviewSummary
    trace: ProcessingTrace


class AnalyzeResponse(BaseModel):
    platform: Platform
    results: list[ItemResult]
    errors: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str = "ok"
    tikhub_configured: bool
    claude_configured: bool
    asr_configured: bool
    ffmpeg_available: bool

