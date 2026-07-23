from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    tikhub_api_key: str | None = None
    tikhub_base_url: str = "https://api.tikhub.io"
    anthropic_api_key: str | None = None
    claude_model: str = "claude-sonnet-5"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    asr_model: str = "gpt-4o-mini-transcribe"

    media_work_dir: Path = Path("./data")
    max_download_mb: int = Field(default=500, ge=1, le=5000)
    max_frames: int = Field(default=12, ge=1, le=50)
    frame_interval_seconds: int = Field(default=30, ge=1, le=600)
    keep_media: bool = False
    request_timeout_seconds: float = 60.0

    @property
    def has_tikhub(self) -> bool:
        return bool(self.tikhub_api_key)

    @property
    def has_claude(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_asr(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

