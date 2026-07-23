from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from app.config import Settings
from app.models import ContentItem, ContentKind, Platform


class TikHubError(RuntimeError):
    pass


def _walk(value: Any) -> Iterable[tuple[str, Any]]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _first(value: Any, *keys: str) -> Any:
    for wanted in keys:
        for key, child in _walk(value):
            if key == wanted and child not in (None, "", [], {}):
                return child
    return None


def _strings(value: Any, *keys: str) -> list[str]:
    wanted = set(keys)
    result: list[str] = []
    for key, child in _walk(value):
        if key not in wanted:
            continue
        candidates = child if isinstance(child, list) else [child]
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.startswith("http"):
                result.append(candidate)
            elif isinstance(candidate, dict):
                url = candidate.get("url") or candidate.get("src")
                if isinstance(url, str) and url.startswith("http"):
                    result.append(url)
    return list(dict.fromkeys(result))


def _nested(value: Any, *path: str) -> Any:
    current = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def detect_platform(url: str) -> Platform:
    host = urlparse(url).netloc.lower()
    mapping = {
        "douyin.com": Platform.DOUYIN,
        "xiaohongshu.com": Platform.XIAOHONGSHU,
        "xhslink.com": Platform.XIAOHONGSHU,
        "bilibili.com": Platform.BILIBILI,
        "b23.tv": Platform.BILIBILI,
        "youtube.com": Platform.YOUTUBE,
        "youtu.be": Platform.YOUTUBE,
        "mp.weixin.qq.com": Platform.WECHAT,
        "zhihu.com": Platform.ZHIHU,
    }
    for domain, platform in mapping.items():
        if host == domain or host.endswith(f".{domain}"):
            return platform
    raise TikHubError(f"Cannot detect platform from URL: {url}")


class TikHubClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        headers = {"Accept": "application/json"}
        if settings.tikhub_api_key:
            headers["Authorization"] = f"Bearer {settings.tikhub_api_key}"
        self.http = httpx.AsyncClient(
            base_url=settings.tikhub_base_url.rstrip("/"),
            headers=headers,
            timeout=settings.request_timeout_seconds,
            transport=transport,
        )

    async def close(self) -> None:
        await self.http.aclose()

    async def _request(
        self, method: str, path: str, *, params: dict[str, Any] | None = None, json: dict[str, Any] | None = None
    ) -> Any:
        response = await self.http.request(method, path, params=params, json=json)
        try:
            payload = response.json()
        except ValueError as exc:
            raise TikHubError(f"TikHub returned non-JSON ({response.status_code})") from exc
        if response.is_error:
            message = payload.get("message_zh") or payload.get("message") or response.text[:300]
            raise TikHubError(f"TikHub HTTP {response.status_code}: {message}")
        code = payload.get("code") if isinstance(payload, dict) else None
        if code not in (None, 0, 200):
            message = payload.get("message_zh") or payload.get("message") or f"code={code}"
            raise TikHubError(f"TikHub API error: {message}")
        return payload.get("data", payload) if isinstance(payload, dict) else payload

    async def fetch_demo(self, name: str = "wechat") -> ContentItem:
        if name == "douyin":
            data = await self._request("GET", "/api/v1/demo/douyin/web/fetch_one_video")
            return normalize_item(Platform.DOUYIN, data, source_url="demo://douyin")
        data = await self._request("GET", "/api/v1/demo/wechat/article_extract")
        return normalize_item(Platform.WECHAT, data, source_url="demo://wechat")

    async def fetch_content(self, platform: Platform, url: str) -> ContentItem:
        if platform == Platform.DOUYIN:
            data = await self._request(
                "GET", "/api/v1/douyin/web/fetch_one_video_by_share_url", params={"share_url": url}
            )
        elif platform == Platform.XIAOHONGSHU:
            note_id, xsec_token = _xiaohongshu_note_params(url)
            if note_id and xsec_token:
                data = await self._request(
                    "GET",
                    "/api/v1/xiaohongshu/web_v3/fetch_note_detail",
                    params={"note_id": note_id, "xsec_token": xsec_token},
                )
            else:
                data = await self._request(
                    "GET", "/api/v1/xiaohongshu/app_v2/get_image_note_detail", params={"share_text": url}
                )
                note_type = str(_first(data, "note_type") or (data.get("type") if isinstance(data, dict) else ""))
                normalized = normalize_item(Platform.XIAOHONGSHU, data, source_url=url)
                if "video" in note_type.lower() or (not normalized.images and not normalized.text):
                    data = await self._request(
                        "GET", "/api/v1/xiaohongshu/app_v2/get_video_note_detail", params={"share_text": url}
                    )
        elif platform == Platform.BILIBILI:
            data = await self._request("GET", "/api/v1/bilibili/web/fetch_one_video_v3", params={"url": url})
            bvid = _first(data, "bvid", "bv_id")
            cid = _first(data, "cid", "c_id")
            if bvid and cid:
                try:
                    streams = await self._request(
                        "GET",
                        "/api/v1/bilibili/web/fetch_video_playurl",
                        params={"bv_id": bvid, "cid": cid},
                    )
                    if isinstance(data, dict):
                        data["_review_streams"] = streams
                except TikHubError:
                    pass
        elif platform == Platform.YOUTUBE:
            video_id = _youtube_video_id(url)
            data = await self._request(
                "GET",
                "/api/v1/youtube/web_v2/get_video_info",
                params={"video_id": video_id, "need_format": True},
            )
            try:
                streams = await self._request(
                    "GET", "/api/v1/youtube/web_v2/get_video_streams", params={"video_id": video_id}
                )
                if isinstance(data, dict):
                    data["_review_streams"] = streams
                    if not _mime_stream_urls(streams, require_audio=True):
                        itag = _muxed_itag(streams)
                        if itag is not None:
                            signed = await self._request(
                                "GET",
                                "/api/v1/youtube/web_v2/get_signed_stream_url",
                                params={"video_id": video_id, "itag": itag},
                            )
                            signed_url = signed if isinstance(signed, str) else _first(signed, "url", "stream_url")
                            if isinstance(signed_url, str):
                                data["_review_signed_url"] = signed_url
            except TikHubError:
                pass
        elif platform == Platform.WECHAT:
            data = await self._request(
                "POST", "/api/v1/wechat_mp/v2/fetch_article_detail", json={"url": url, "raw": False}
            )
        elif platform == Platform.ZHIHU:
            kind, content_id = _zhihu_content_id(url)
            path = (
                "/api/v1/zhihu/web/fetch_answer_detail"
                if kind == "answer"
                else "/api/v1/zhihu/web/fetch_column_article_detail"
            )
            data = await self._request("GET", path, params={f"{kind}_id": content_id})
        else:
            raise TikHubError(f"Unsupported platform: {platform}")
        return normalize_item(platform, data, source_url=url)

    async def fetch_creator(self, platform: Platform, creator: str, limit: int) -> list[ContentItem]:
        if platform == Platform.DOUYIN:
            sec_user_id = creator
            if creator.startswith("http"):
                resolved = await self._request(
                    "GET", "/api/v1/douyin/web/get_sec_user_id", params={"url": creator}
                )
                sec_user_id = str(_first(resolved, "sec_user_id", "sec_uid") or resolved)
            data = await self._request(
                "GET",
                "/api/v1/douyin/web/fetch_user_post_videos",
                params={"sec_user_id": sec_user_id, "count": limit},
            )
        elif platform == Platform.XIAOHONGSHU:
            param = {"share_text": creator} if creator.startswith("http") else {"user_id": creator}
            data = await self._request("GET", "/api/v1/xiaohongshu/app_v2/get_user_posted_notes", params=param)
        elif platform == Platform.BILIBILI:
            uid = creator
            if creator.startswith("http"):
                resolved = await self._request(
                    "GET", "/api/v1/bilibili/web/fetch_get_user_id", params={"share_link": creator}
                )
                uid = str(_first(resolved, "uid", "mid", "user_id") or resolved)
            data = await self._request(
                "GET", "/api/v1/bilibili/web/fetch_user_post_videos", params={"uid": uid, "pn": 1}
            )
        elif platform == Platform.YOUTUBE:
            channel_id = creator
            if creator.startswith("http"):
                resolved = await self._request(
                    "GET", "/api/v1/youtube/web_v2/get_channel_id", params={"channel_url": creator}
                )
                channel_id = str(_first(resolved, "channel_id", "channelId", "externalId") or resolved)
            data = await self._request(
                "GET",
                "/api/v1/youtube/web_v2/get_channel_videos",
                params={"channel_id": channel_id, "need_format": True},
            )
        elif platform == Platform.WECHAT:
            if not creator.startswith("gh_"):
                raise TikHubError("WeChat creator must be a gh_username such as gh_363b924965e9")
            data = await self._request(
                "POST",
                "/api/v1/wechat_mp/v2/fetch_account_articles",
                json={"username": creator, "page_size": max(10, limit), "raw": False},
            )
        elif platform == Platform.ZHIHU:
            token = _zhihu_user_token(creator)
            articles = await self._request(
                "GET",
                "/api/v1/zhihu/web/fetch_user_articles",
                params={"user_url_token": token, "limit": str(limit)},
            )
            answers = await self._request(
                "GET",
                "/api/v1/zhihu/web/fetch_user_answers",
                params={"user_url_token": token, "limit": str(limit)},
            )
            data = {"items": _extract_items(articles) + _extract_items(answers)}
        else:
            raise TikHubError(f"Unsupported platform: {platform}")

        raw_items = _extract_items(data)[:limit]
        if not raw_items and isinstance(data, dict):
            raw_items = [data]
        return [normalize_item(platform, raw) for raw in raw_items]

    async def fetch_captions(self, item: ContentItem, language: str) -> str:
        if item.platform == Platform.YOUTUBE:
            video_id = item.content_id or (_youtube_video_id(item.source_url) if item.source_url else None)
            if not video_id:
                return ""
            data = await self._request(
                "GET",
                "/api/v1/youtube/web_v2/get_video_captions",
                params={"video_id": video_id, "language_code": language, "format": "txt"},
            )
            return _caption_text(data)
        if item.platform == Platform.BILIBILI:
            aid = _first(item.raw, "aid", "a_id")
            cid = _first(item.raw, "cid", "c_id")
            if not aid or not cid:
                return ""
            data = await self._request(
                "GET", "/api/v1/bilibili/web/fetch_video_subtitle", params={"a_id": aid, "c_id": cid}
            )
            return _caption_text(data)
        return ""


def _extract_items(data: Any) -> list[dict[str, Any]]:
    preferred = (
        "aweme_list",
        "notes",
        "items",
        "videos",
        "list",
        "archives",
        "articles",
        "answers",
        "contents",
    )
    for key in preferred:
        value = _first(data, key)
        if isinstance(value, list) and any(isinstance(item, dict) for item in value):
            return [item for item in value if isinstance(item, dict)]
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    return []


def normalize_item(platform: Platform, data: Any, source_url: str | None = None) -> ContentItem:
    raw = data if isinstance(data, dict) else {"data": data}
    root = _nested(raw, "aweme_detail") or _nested(raw, "item") or _nested(raw, "note") or raw

    title = str(_first(root, "title", "name", "desc") or "")
    text = _extract_text(platform, root)
    author_value = _first(root, "nickname", "author_name", "author", "user_name", "name")
    if isinstance(author_value, dict):
        author_value = _first(author_value, "nickname", "name", "username")
    author = str(author_value or "")
    content_id = _first(root, "aweme_id", "note_id", "bvid", "video_id", "article_id", "answer_id", "id")
    published = _first(root, "published_at", "publish_time", "pubdate", "create_time", "datetime")

    images = _extract_images(platform, root)
    videos = _extract_videos(platform, root)
    audio = _extract_audio(root)
    kind = _kind(platform, root, images, videos)

    if not source_url:
        source_url = _first(root, "share_url", "url", "web_url", "arcurl")
    source_url = _canonical_url(platform, content_id, source_url)
    metadata = {
        "stats": _first(root, "statistics", "stat", "metrics") or {},
        "duration": _first(root, "duration", "length", "video_duration"),
    }
    return ContentItem(
        platform=platform,
        content_id=str(content_id) if content_id is not None else None,
        kind=kind,
        source_url=str(source_url) if source_url else None,
        title=title,
        author=author,
        text=text,
        published_at=str(published) if published is not None else None,
        images=images[:30],
        videos=videos[:3],
        audio=audio[:3],
        metadata=metadata,
        raw=raw,
    )


def _extract_text(platform: Platform, root: dict[str, Any]) -> str:
    if platform == Platform.WECHAT:
        value = _nested(root, "content", "article", "full_text") or _first(root, "full_text")
        if value:
            return str(value)
    candidates = []
    for key in ("content", "text", "desc", "description", "excerpt", "summary"):
        value = _first(root, key)
        if isinstance(value, str) and len(value.strip()) > 1:
            candidates.append(value.strip())
    return max(candidates, key=len, default="")


def _extract_images(platform: Platform, root: dict[str, Any]) -> list[str]:
    if platform == Platform.WECHAT:
        images = _nested(root, "content", "article", "images")
        if isinstance(images, list):
            return list(
                dict.fromkeys(str(image.get("src")) for image in images if isinstance(image, dict) and image.get("src"))
            )
    result = _strings(root, "image_list", "images", "image_urls", "cover", "thumbnail", "src")
    return [url for url in result if not _looks_like_video(url)]


def _extract_videos(platform: Platform, root: dict[str, Any]) -> list[str]:
    if platform == Platform.DOUYIN:
        video = root.get("video", {})
        bit_rates = video.get("bit_rate", []) if isinstance(video, dict) else []
        if isinstance(bit_rates, list):
            compatible = [
                stream
                for stream in bit_rates
                if isinstance(stream, dict) and not stream.get("is_h265") and not stream.get("is_bytevc1")
            ]
            compatible.sort(
                key=lambda stream: (
                    abs(int(_nested(stream, "play_addr", "width") or 1920) - 1080),
                    int(stream.get("bit_rate") or 0),
                )
            )
            for stream in compatible:
                urls = _nested(stream, "play_addr", "url_list")
                if isinstance(urls, list) and urls:
                    return [str(url) for url in urls if isinstance(url, str) and url.startswith("http")]
        result = _strings(video, "play_url", "download_url")
        play_urls = _nested(video, "play_addr", "url_list")
        if isinstance(play_urls, list):
            result.extend(str(url) for url in play_urls if isinstance(url, str))
        return list(dict.fromkeys(result))
    if platform == Platform.YOUTUBE:
        signed = root.get("_review_signed_url")
        if isinstance(signed, str) and signed.startswith("http"):
            return [signed]
        muxed = _mime_stream_urls(root, require_audio=True)
        return muxed or _mime_stream_urls(root, require_audio=False)
    if platform == Platform.BILIBILI:
        progressive = _urls_from_named_list(root, "durl")
        if progressive:
            return progressive
        result = _strings(root, "play_url", "playUrl", "baseUrl", "base_url")
        return [url for url in result if _looks_like_video(url) or "bilivideo" in url]
    result = _strings(
        root, "play_url", "playUrl", "video_url", "stream_url", "download_url", "master_url"
    )
    return [url for url in result if _looks_like_video(url)]


def _extract_audio(root: dict[str, Any]) -> list[str]:
    return _strings(root, "audio_url", "audioUrl")


def _kind(platform: Platform, root: dict[str, Any], images: list[str], videos: list[str]) -> ContentKind:
    if videos or platform in (Platform.BILIBILI, Platform.YOUTUBE):
        return ContentKind.VIDEO
    if platform == Platform.WECHAT:
        return ContentKind.ARTICLE
    if platform == Platform.ZHIHU:
        return ContentKind.ANSWER if _first(root, "answer_id", "question") else ContentKind.ARTICLE
    if images:
        return ContentKind.IMAGE_TEXT
    return ContentKind.UNKNOWN


def _looks_like_video(url: str) -> bool:
    lowered = url.lower()
    return any(part in lowered for part in (".mp4", ".m3u8", "video", "play/", "play?"))


def _mime_stream_urls(value: Any, require_audio: bool) -> list[str]:
    result: list[tuple[int, str]] = []

    def collect(child: Any) -> None:
        if isinstance(child, dict):
            mime = str(child.get("mimeType") or child.get("mime_type") or "").lower()
            url = child.get("url")
            has_audio = bool(
                child.get("audioQuality") or child.get("audio_quality") or child.get("audioChannels")
            )
            if mime.startswith("video/") and isinstance(url, str) and (not require_audio or has_audio):
                height = int(child.get("height") or 0)
                result.append((abs(height - 720), url))
            for nested in child.values():
                collect(nested)
        elif isinstance(child, list):
            for nested in child:
                collect(nested)

    collect(value)
    return list(dict.fromkeys(url for _, url in sorted(result, key=lambda pair: pair[0])))


def _muxed_itag(value: Any) -> int | None:
    candidates: list[tuple[int, int]] = []

    def collect(child: Any) -> None:
        if isinstance(child, dict):
            mime = str(child.get("mimeType") or child.get("mime_type") or "").lower()
            has_audio = bool(
                child.get("audioQuality") or child.get("audio_quality") or child.get("audioChannels")
            )
            itag = child.get("itag")
            if mime.startswith("video/") and has_audio and isinstance(itag, int):
                candidates.append((abs(int(child.get("height") or 0) - 720), itag))
            for nested in child.values():
                collect(nested)
        elif isinstance(child, list):
            for nested in child:
                collect(nested)

    collect(value)
    return min(candidates, key=lambda pair: pair[0])[1] if candidates else None


def _urls_from_named_list(value: Any, list_key: str) -> list[str]:
    for key, child in _walk(value):
        if key == list_key and isinstance(child, list):
            urls = [
                str(item.get("url"))
                for item in child
                if isinstance(item, dict) and isinstance(item.get("url"), str)
            ]
            if urls:
                return list(dict.fromkeys(urls))
    return []


def _canonical_url(platform: Platform, content_id: Any, candidate: Any) -> str | None:
    value = str(content_id) if content_id is not None else ""
    if platform == Platform.DOUYIN and value:
        return f"https://www.douyin.com/video/{value}"
    if platform == Platform.XIAOHONGSHU and value:
        return f"https://www.xiaohongshu.com/explore/{value}"
    if platform == Platform.BILIBILI and value:
        return f"https://www.bilibili.com/video/{value}"
    if platform == Platform.YOUTUBE and value:
        return f"https://www.youtube.com/watch?v={value}"
    if platform == Platform.ZHIHU and value:
        if isinstance(candidate, str) and "/answer/" in candidate:
            return f"https://www.zhihu.com/question/0/answer/{value}"
        if isinstance(candidate, str) and ("zhuanlan.zhihu.com" in candidate or "/p/" in candidate):
            return f"https://zhuanlan.zhihu.com/p/{value}"
    if isinstance(candidate, str) and candidate.startswith("http"):
        return candidate
    return None


def _youtube_video_id(url: str | None) -> str:
    if not url:
        raise TikHubError("Missing YouTube URL")
    parsed = urlparse(url)
    if parsed.netloc.endswith("youtu.be"):
        value = parsed.path.strip("/").split("/")[0]
    elif "/shorts/" in parsed.path:
        value = parsed.path.split("/shorts/", 1)[1].split("/", 1)[0]
    else:
        value = parse_qs(parsed.query).get("v", [""])[0]
    if not re.fullmatch(r"[\w-]{11}", value):
        raise TikHubError(f"Cannot extract YouTube video ID from {url}")
    return value


def _xiaohongshu_note_params(url: str) -> tuple[str | None, str | None]:
    parsed = urlparse(url)
    match = re.search(r"/(?:explore|discovery/item)/([A-Za-z0-9]+)", parsed.path)
    token = parse_qs(parsed.query).get("xsec_token", [None])[0]
    return (match.group(1) if match else None), token


def _zhihu_content_id(url: str) -> tuple[str, str]:
    answer = re.search(r"/answer/(\d+)", url)
    if answer:
        return "answer", answer.group(1)
    article = re.search(r"(?:zhuanlan\.zhihu\.com/p/|/p/)(\d+)", url)
    if article:
        return "article", article.group(1)
    raise TikHubError("Zhihu content URL must be an answer or zhuanlan article URL")


def _zhihu_user_token(value: str) -> str:
    match = re.search(r"/people/([^/?#]+)", value)
    return match.group(1) if match else value


def _caption_text(data: Any) -> str:
    if isinstance(data, str):
        return data
    for key in ("text", "content", "caption", "subtitle", "body"):
        value = _first(data, key)
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            chunks = []
            for item in value:
                if isinstance(item, dict):
                    chunk = item.get("content") or item.get("text")
                    if chunk:
                        chunks.append(str(chunk))
            if chunks:
                return "\n".join(chunks)
    return ""
