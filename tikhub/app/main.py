from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request

from app.config import get_settings
from app.models import AnalyzeRequest, AnalyzeResponse, HealthResponse
from app.pipeline import ReviewPipeline
from app.tikhub import TikHubError


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pipeline = ReviewPipeline(get_settings())
    yield
    await app.state.pipeline.close()


app = FastAPI(
    title="TikHub Multimodal Content Review",
    version="0.1.0",
    description="Pull social content through TikHub, run captions/ASR/OCR/keyframe review, and return a normalized summary.",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    import shutil

    settings = get_settings()
    return HealthResponse(
        tikhub_configured=settings.has_tikhub,
        claude_configured=settings.has_claude,
        asr_configured=settings.has_asr,
        ffmpeg_available=bool(shutil.which("ffmpeg")),
    )


@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest, request: Request) -> AnalyzeResponse:
    try:
        return await request.app.state.pipeline.analyze(payload)
    except TikHubError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/demo", response_model=AnalyzeResponse)
async def demo(request: Request, sample: str = Query(default="wechat", pattern="^(wechat|douyin)$")) -> AnalyzeResponse:
    try:
        return await request.app.state.pipeline.demo(sample)
    except TikHubError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

