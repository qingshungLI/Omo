from __future__ import annotations

import asyncio
import ipaddress
import mimetypes
import shutil
import socket
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import httpx
from openai import AsyncOpenAI

from app.config import Settings


class MediaError(RuntimeError):
    pass


@dataclass
class PreparedMedia:
    images: list[Path] = field(default_factory=list)
    frames: list[Path] = field(default_factory=list)
    transcript: str = ""
    used_asr: bool = False
    warnings: list[str] = field(default_factory=list)
    work_dir: Path | None = None


class MediaProcessor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.http = httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(60, read=300),
            headers={"User-Agent": "Mozilla/5.0 SocialReviewPipeline/0.1"},
        )
        self.asr = (
            AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
            if settings.openai_api_key
            else None
        )

    async def close(self) -> None:
        await self.http.aclose()

    async def prepare(
        self, image_urls: list[str], video_urls: list[str], audio_urls: list[str], existing_transcript: str
    ) -> PreparedMedia:
        self.settings.media_work_dir.mkdir(parents=True, exist_ok=True)
        work_dir = Path(tempfile.mkdtemp(prefix="review-", dir=self.settings.media_work_dir))
        result = PreparedMedia(transcript=existing_transcript, work_dir=work_dir)

        for index, url in enumerate(image_urls[: self.settings.max_frames]):
            try:
                suffix = _url_suffix(url, ".jpg")
                path = work_dir / f"image-{index:03d}{suffix}"
                await self._download(url, path, max_mb=20)
                result.images.append(path)
            except Exception as exc:
                result.warnings.append(f"Image {index + 1} skipped: {exc}")

        source_url = (video_urls or audio_urls or [None])[0]
        if source_url:
            try:
                source = work_dir / ("source" + _url_suffix(source_url, ".mp4"))
                await self._download(source_url, source, max_mb=self.settings.max_download_mb)
                if video_urls and shutil.which("ffmpeg"):
                    result.frames = await self._extract_frames(source, work_dir)
                elif video_urls:
                    result.warnings.append("ffmpeg is unavailable; keyframes were skipped")
                if not result.transcript and self.asr:
                    if not shutil.which("ffmpeg"):
                        result.warnings.append("ffmpeg is unavailable; ASR audio extraction was skipped")
                    else:
                        audio = work_dir / "audio.mp3"
                        await _run(
                            "ffmpeg",
                            "-y",
                            "-i",
                            str(source),
                            "-vn",
                            "-ac",
                            "1",
                            "-ar",
                            "16000",
                            "-b:a",
                            "64k",
                            str(audio),
                        )
                        result.transcript = await self._transcribe(audio)
                        result.used_asr = bool(result.transcript)
                elif not result.transcript:
                    result.warnings.append("No platform captions and OPENAI_API_KEY is not configured; ASR skipped")
            except Exception as exc:
                result.warnings.append(f"Media processing skipped: {exc}")
        return result

    async def cleanup(self, prepared: PreparedMedia) -> None:
        if prepared.work_dir and not self.settings.keep_media:
            await asyncio.to_thread(shutil.rmtree, prepared.work_dir, True)

    async def _download(self, url: str, destination: Path, max_mb: int) -> None:
        await _ensure_public_url(url)
        max_bytes = max_mb * 1024 * 1024
        size = 0
        async with self.http.stream("GET", url) as response:
            response.raise_for_status()
            declared = int(response.headers.get("content-length", "0") or 0)
            if declared > max_bytes:
                raise MediaError(f"download is {declared / 1024 / 1024:.1f} MB, limit is {max_mb} MB")
            with destination.open("wb") as output:
                async for chunk in response.aiter_bytes(1024 * 1024):
                    size += len(chunk)
                    if size > max_bytes:
                        raise MediaError(f"download exceeded {max_mb} MB")
                    output.write(chunk)

    async def _extract_frames(self, source: Path, work_dir: Path) -> list[Path]:
        pattern = work_dir / "frame-%03d.jpg"
        duration = await _probe_duration(source)
        interval = min(
            float(self.settings.frame_interval_seconds),
            max(2.0, duration / self.settings.max_frames) if duration else float(self.settings.frame_interval_seconds),
        )
        await _run(
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-vf",
            f"fps=1/{interval:.3f},scale='min(1280,iw)':-2",
            "-frames:v",
            str(self.settings.max_frames),
            "-q:v",
            "3",
            str(pattern),
        )
        return sorted(work_dir.glob("frame-*.jpg"))[: self.settings.max_frames]

    async def _transcribe(self, audio: Path) -> str:
        if not self.asr:
            return ""
        with audio.open("rb") as stream:
            response = await self.asr.audio.transcriptions.create(
                model=self.settings.asr_model,
                file=stream,
                response_format="text",
            )
        return response if isinstance(response, str) else str(response)


async def _run(*args: str) -> None:
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await process.communicate()
    if process.returncode:
        message = stderr.decode("utf-8", errors="replace")[-1000:]
        raise MediaError(f"{args[0]} failed: {message}")


async def _probe_duration(source: Path) -> float | None:
    if not shutil.which("ffprobe"):
        return None
    process = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(source),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await process.communicate()
    if process.returncode:
        return None
    try:
        return float(stdout.decode().strip())
    except ValueError:
        return None


async def _ensure_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise MediaError("only public HTTP(S) media URLs are allowed")
    try:
        addresses = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, None)
    except socket.gaierror as exc:
        raise MediaError(f"cannot resolve media host {parsed.hostname}") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise MediaError("private or reserved media addresses are blocked")


def _url_suffix(url: str, default: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mp3", ".m4a", ".webm", ".mov"}:
        return suffix
    guessed = mimetypes.guess_extension(mimetypes.guess_type(url)[0] or "")
    return guessed or default
