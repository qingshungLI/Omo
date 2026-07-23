import httpx
import pytest

from app.config import Settings
from app.models import AnalyzeRequest, Platform
from app.pipeline import ReviewPipeline
from app.reviewer import fallback_summary
from app.media import PreparedMedia
from app.tikhub import TikHubClient, normalize_item


def test_fallback_summary_uses_source_text() -> None:
    item = normalize_item(
        Platform.ZHIHU,
        {"title": "Test title", "content": "First point. Second point. Third point."},
    )
    summary = fallback_summary(item, PreparedMedia())
    assert summary.one_sentence == "Test title"
    assert summary.key_points[:2] == ["First point.", "Second point."]
    assert "fallback" in summary.risks[0]


@pytest.mark.asyncio
async def test_content_pipeline_without_keys() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/zhihu/web/fetch_answer_detail"
        return httpx.Response(
            200,
            json={
                "code": 200,
                "data": {"answer_id": "2", "title": "Question", "content": "Answer text."},
            },
        )

    settings = Settings()
    tikhub = TikHubClient(settings, transport=httpx.MockTransport(handler))
    pipeline = ReviewPipeline(settings, tikhub=tikhub)
    try:
        response = await pipeline.analyze(
            AnalyzeRequest(
                platform=Platform.AUTO,
                content_url="https://www.zhihu.com/question/1/answer/2",
                analyze_media=False,
            )
        )
    finally:
        await pipeline.close()
    assert response.platform == Platform.ZHIHU
    assert response.results[0].summary.one_sentence == "Question"
    assert response.results[0].trace.summarizer == "fallback"

