import secrets

from fastapi import Header, HTTPException

from .config import get_settings


def require_app_token(authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {get_settings().app_api_token}".encode()
    if not authorization or not secrets.compare_digest(authorization.encode(), expected):
        raise HTTPException(401, "Missing or invalid bearer token.")
