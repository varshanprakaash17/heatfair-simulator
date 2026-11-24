"""Application configuration (environment driven)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent          # heatfair/backend
PROJECT_ROOT = BASE_DIR.parent                             # heatfair


class Settings(BaseSettings):
    """Runtime settings.

    ``DATABASE_URL`` accepts either a local SQLite file (the default, used for
    development and the demo) or a PostgreSQL/Supabase connection string. The
    same SQLAlchemy models and migrations apply to both.
    """

    model_config = SettingsConfigDict(env_file=(BASE_DIR / ".env", PROJECT_ROOT / ".env"), extra="ignore")

    app_name: str = "HeatFair API"
    api_prefix: str = "/api/v1"
    environment: str = "development"
    database_url: str = f"sqlite:///{(BASE_DIR / 'heatfair.db').as_posix()}"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Optional regex for origins that vary per environment (e.g. hosted previews).
    # Set in production to allow the deployed frontend origin without a redeploy.
    cors_origin_regex_pattern: str = ""
    auto_seed_demo: bool = True
    reports_dir: str = str(BASE_DIR / "reports")
    weather_cache_seconds: int = 900
    open_meteo_timeout_seconds: float = 8.0
    demo_organization_name: str = "Meridian Logistics (fictional)"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        """An explicit pattern wins; otherwise allow loopback ports in development."""
        if self.cors_origin_regex_pattern:
            return self.cors_origin_regex_pattern
        if self.environment != "development":
            return None
        return r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def reports_path(self) -> Path:
        path = Path(self.reports_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    # Allow an explicit override used by tests.
    if os.getenv("HEATFAIR_DB_OVERRIDE"):
        s = Settings(database_url=os.environ["HEATFAIR_DB_OVERRIDE"])
        return s
    return Settings()
