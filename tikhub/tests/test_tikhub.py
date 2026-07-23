import httpx
import pytest

from app.config import Settings
from app.models import Platform
from app.tikhub import TikHubClient, TikHubError, detect_platform, normalize_item


@pytest.mark.parametrize(
    ("url", "platform"),
    [
        ("https://v.douyin.com/abc", Platform.DOUYIN),
        ("https://www.xiaohongshu.com/explore/abc", Platform.XIAOHONGSHU),
        ("https://b23.tv/abc", Platform.BILIBILI),
        ("https://youtu.be/dQw4w9WgXcQ", Platform.YOUTUBE),
        ("https://mp.weixin.qq.com/s/abc", Platform.WECHAT),
        ("https://www.zhihu.com/question/1/answer/2", Platform.ZHIHU),
    ],
)
def test_detect_platform(url: str, platform: Platform) -> None:
    assert detect_platform(url) == platform


def test_normalize_wechat_article() -> None:
    item = normalize_item(
        Platform.WECHAT,
        {
            "title": "A title",
            "author": "An author",
            "datetime": "2026-01-01",
            "content": {
                "article": {
                    "full_text": "Paragraph one. Paragraph two.",
                    "images": [{"src": "https://mmbiz.qpic.cn/a.jpg"}],
                }
            },
        },
        "https://mp.weixin.qq.com/s/test",
    )
    assert item.title == "A title"
    assert item.author == "An author"
    assert item.text == "Paragraph one. Paragraph two."
    assert item.images == ["https://mmbiz.qpic.cn/a.jpg"]
    assert item.kind.value == "article"


def test_normalize_douyin_video_prefers_video_stream() -> None:
    item = normalize_item(
        Platform.DOUYIN,
        {
            "aweme_detail": {
                "aweme_id": "123",
                "desc": "Video caption",
                "author": {"nickname": "Creator"},
                "video": {
                    "bit_rate": [
                        {
                            "is_h265": 1,
                            "bit_rate": 9000000,
                            "play_addr": {"width": 3840, "url_list": ["https://cdn.test/4k.mp4"]},
                        },
                        {
                            "is_h265": 0,
                            "bit_rate": 3000000,
                            "play_addr": {"width": 1920, "url_list": ["https://cdn.test/1080.mp4"]},
                        },
                    ]
                },
            }
        },
    )
    assert item.source_url == "https://www.douyin.com/video/123"
    assert item.videos == ["https://cdn.test/1080.mp4"]
    assert item.author == "Creator"


@pytest.mark.asyncio
async def test_demo_response_is_normalized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/demo/wechat/article_extract"
        return httpx.Response(
            200,
            json={
                "code": 200,
                "data": {
                    "title": "Demo",
                    "author": "Account",
                    "content": {"article": {"full_text": "Demo body", "images": []}},
                },
            },
        )

    client = TikHubClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        item = await client.fetch_demo("wechat")
    finally:
        await client.close()
    assert item.title == "Demo"
    assert item.text == "Demo body"


@pytest.mark.asyncio
async def test_xiaohongshu_url_uses_web_v3_when_token_is_present() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/xiaohongshu/web_v3/fetch_note_detail"
        assert request.url.params["note_id"] == "abc123"
        assert request.url.params["xsec_token"] == "token123"
        return httpx.Response(200, json={"code": 200, "data": {"note_id": "abc123", "title": "Note"}})

    client = TikHubClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        item = await client.fetch_content(
            Platform.XIAOHONGSHU,
            "https://www.xiaohongshu.com/explore/abc123?xsec_token=token123",
        )
    finally:
        await client.close()
    assert item.content_id == "abc123"


@pytest.mark.asyncio
async def test_youtube_fetches_signed_muxed_stream() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("get_video_info"):
            data = {"video_id": "dQw4w9WgXcQ", "title": "Video"}
        elif request.url.path.endswith("get_video_streams"):
            data = {
                "formats": [
                    {"itag": 18, "mimeType": "video/mp4", "height": 360, "audioQuality": "AUDIO_QUALITY_MEDIUM"},
                    {"itag": 22, "mimeType": "video/mp4", "height": 720, "audioQuality": "AUDIO_QUALITY_MEDIUM"},
                ]
            }
        else:
            assert request.url.path.endswith("get_signed_stream_url")
            assert request.url.params["itag"] == "22"
            data = {"url": "https://video.googlevideo.com/muxed.mp4"}
        return httpx.Response(200, json={"code": 200, "data": data})

    client = TikHubClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        item = await client.fetch_content(Platform.YOUTUBE, "https://youtu.be/dQw4w9WgXcQ")
    finally:
        await client.close()
    assert item.videos == ["https://video.googlevideo.com/muxed.mp4"]


def test_unknown_platform() -> None:
    with pytest.raises(TikHubError):
        detect_platform("https://example.com/content")
