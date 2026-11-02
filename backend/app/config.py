import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

# The service can be started three ways: by `npm run dev:all` (which loads the
# repo-root `.env` for it), by hand from `backend/`, or by a test runner. When
# python-dotenv is installed, load `backend/.env` so a manual
# `uvicorn app.main:app` picks up the same APP_API_TOKEN. A variable that is
# already set always wins, so this never changes behaviour for CI, Docker or the
# dev script (which exports the root `.env` itself).
try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class Settings:
    encryption_key: str
    app_api_token: str
    database_path: str
    octopus_rest_base: str = "https://api.octopus.energy/v1"
    octopus_graphql_url: str = "https://api.octopus.energy/v1/graphql/"
    open_meteo_api_key: str | None = None   # free tier is non-commercial only; set this for commercial use


@lru_cache
def get_settings() -> Settings:
    key = os.environ.get("ENCRYPTION_KEY")
    token = os.environ.get("APP_API_TOKEN")
    if not key or not token:
        raise RuntimeError("ENCRYPTION_KEY and APP_API_TOKEN must be set (see .env.example)")
    return Settings(
        encryption_key=key,
        app_api_token=token,
        database_path=os.environ.get("DATABASE_PATH", "eneros.db"),
        open_meteo_api_key=os.environ.get("OPEN_METEO_API_KEY") or None,
    )
