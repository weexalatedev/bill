"""Solis (SolisCloud Platform API v2.0.x): solar inverters.

Credentials the user pastes: API ID + API Secret (SolisCloud > Account > Basic Settings > API Management).
Every call is a POST with a JSON body, signed with HMAC-SHA1 (no OAuth, no tokens to refresh).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from email.utils import format_datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, SecretStr, field_validator

from ..auth import require_app_token
from ..gate import require_sync_active
from . import store
from .errors import ProviderAuthError, ProviderError, ProviderRateLimited

PROVIDER = "solis"
BASE_URL = "https://www.soliscloud.com:13333"
CONTENT_TYPE = "application/json"  # live server signs over plain application/json, not the ;charset variant
_transport: httpx.BaseTransport | None = None  # tests inject a mock transport here

_TO_BASE = {"w": 1, "kw": 1e3, "mw": 1e6, "wh": 1, "kwh": 1e3, "mwh": 1e6, "gwh": 1e9}
INVERTER_STATE = {1: "online", 2: "offline", 3: "alarm"}


def content_md5(body: str) -> str:
    return base64.b64encode(hashlib.md5(body.encode()).digest()).decode()


def sign_headers(api_id: str, api_secret: str, resource: str, body: str, now: datetime) -> dict[str, str]:
    md5 = content_md5(body)
    date = format_datetime(now.astimezone(timezone.utc), usegmt=True)
    to_sign = f"POST\n{md5}\n{CONTENT_TYPE}\n{date}\n{resource}"
    sig = base64.b64encode(hmac.new(api_secret.encode(), to_sign.encode(), hashlib.sha1).digest()).decode()
    return {"Content-Type": CONTENT_TYPE, "Content-MD5": md5, "Date": date,
            "Authorization": f"API {api_id}:{sig}"}


class SolisClient:
    def __init__(self, api_id: str, api_secret: str):
        self._id, self._secret = api_id, api_secret
        self._http = httpx.Client(timeout=30, transport=_transport)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._http.close()

    def post(self, resource: str, body: dict) -> Any:
        raw = json.dumps(body, separators=(",", ":"))  # signed bytes must equal sent bytes
        headers = sign_headers(self._id, self._secret, resource, raw, datetime.now(timezone.utc))
        r = self._http.post(BASE_URL + resource, content=raw.encode(), headers=headers)
        if r.status_code in (401, 403):
            raise ProviderAuthError("SolisCloud rejected the signature: check API ID/Secret, "
                                    "and that this server's clock is within 15 minutes of real time.")
        if r.status_code == 429:
            raise ProviderRateLimited("SolisCloud rate limit hit; retry shortly.")
        if r.status_code >= 400:
            raise ProviderError(f"SolisCloud returned HTTP {r.status_code}.")
        env = r.json()  # envelope: {success, code, msg, data}
        if not env.get("success") or str(env.get("code")) not in ("0", "None"):
            raise ProviderError(f"SolisCloud error {env.get('code')}: {env.get('msg')}")
        return env.get("data")

    def stations(self, page_no=1, page_size=20):
        return self.post("/v1/api/userStationList", {"pageNo": page_no, "pageSize": page_size})

    def station_detail(self, station_id: str):
        return self.post("/v1/api/stationDetail", {"id": station_id})

    def inverters(self, page_no=1, page_size=100):
        return self.post("/v1/api/inverterList", {"pageNo": page_no, "pageSize": page_size})

    def inverter_detail(self, sn: str):
        return self.post("/v1/api/inverterDetail", {"sn": sn})

    def inverter_day(self, sn: str, day: str, tz_hours: int = 0, money: str = "GBP"):
        return self.post("/v1/api/inverterDay", {"sn": sn, "money": money, "time": day, "timeZone": tz_hours})


# ------------------------------------------------------------- normalising
def measure(d: dict, key: str) -> dict | None:
    """Solis sends numbers with a companion unit field: pac + pacStr ('kW'). Returns {value, unit, base}."""
    if d.get(key) in (None, ""):
        return None
    try:
        v = float(d[key])
    except (TypeError, ValueError):
        return None
    unit = d.get(key + "Str") or ""
    return {"value": v, "unit": unit, "base": v * _TO_BASE.get(unit.lower(), 1)}


def summarise_inverter(rec: dict, detail: dict) -> dict:
    power, today, total = measure(detail, "pac"), measure(detail, "eToday"), measure(detail, "eTotal")
    return {
        "sn": rec.get("sn") or detail.get("sn"),
        "state": INVERTER_STATE.get(rec.get("state"), "unknown"),
        "current_power_w": power["base"] if power else None,
        "energy_today_kwh": today["base"] / 1e3 if today else None,
        "energy_total_kwh": total["base"] / 1e3 if total else None,
        "missing_fields": [k for k, v in (("pac", power), ("eToday", today), ("eTotal", total)) if v is None],
    }


# ------------------------------------------------------------------- routes
class SolisConnect(BaseModel):
    api_id: str
    api_secret: SecretStr
    home_id: str | None = None

    @field_validator("api_id")
    @classmethod
    def _id(cls, v: str) -> str:
        if len(v.strip()) < 6:
            raise ValueError("API ID looks too short")
        return v.strip()


router = APIRouter(prefix="/v1/solis", tags=["solis"], dependencies=[Depends(require_app_token), Depends(require_sync_active)])


def _client(connection_id: str) -> SolisClient:
    c = store.load(connection_id, PROVIDER)
    return SolisClient(c["api_id"], c["api_secret"])


@router.post("/connections", status_code=201)
def connect(body: SolisConnect):
    """'Connect Device': a signed test call proves the ID/Secret work before we store anything."""
    secret = body.api_secret.get_secret_value().strip()
    with SolisClient(body.api_id, secret) as c:
        data = c.stations(1, 1) or {}
    cid = store.save(PROVIDER, {"api_id": body.api_id, "api_secret": secret}, body.home_id)
    page = data.get("page") or data
    return {"connection_id": cid, "stations_total": page.get("total", page.get("records") and len(page["records"]))}


@router.delete("/connections/{connection_id}", status_code=204)
def disconnect(connection_id: str):
    store.delete(connection_id, PROVIDER)


@router.get("/connections/{connection_id}/stations")
def stations(connection_id: str, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)):
    with _client(connection_id) as c:
        return c.stations(page, size)


@router.get("/connections/{connection_id}/stations/{station_id}")
def station(connection_id: str, station_id: str):
    with _client(connection_id) as c:
        return c.station_detail(station_id)


@router.get("/connections/{connection_id}/inverters")
def inverters(connection_id: str, page: int = Query(1, ge=1), size: int = Query(100, ge=1, le=100)):
    with _client(connection_id) as c:
        return c.inverters(page, size)


@router.get("/connections/{connection_id}/inverters/{sn}")
def inverter(connection_id: str, sn: str):
    """Raw detail plus the normalised power/energy figures."""
    with _client(connection_id) as c:
        detail = c.inverter_detail(sn)
    return {"summary": summarise_inverter({"sn": sn}, detail), "raw": detail}


@router.get("/connections/{connection_id}/inverters/{sn}/day")
def inverter_day(connection_id: str, sn: str, date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
                 tz_hours: int = Query(0, ge=-12, le=14), money: str = "GBP"):
    """Intra-day generation curve (Solis refreshes about every 5 minutes)."""
    with _client(connection_id) as c:
        return c.inverter_day(sn, date, tz_hours, money)


@router.get("/connections/{connection_id}/dashboard")
def dashboard(connection_id: str):
    """Fleet view: inverters by state, live power, energy today/total."""
    with _client(connection_id) as c:
        data = c.inverters(1, 100) or {}
        records = (data.get("page") or {}).get("records", [])
        rows = [summarise_inverter(r, c.inverter_detail(r["sn"])) for r in records if r.get("sn")]
    ok = [r for r in rows if r["current_power_w"] is not None]
    return {
        "status_counts": data.get("inverterStatusVo"),
        "inverters": rows,
        "totals": {
            "inverter_count": len(rows),
            "current_power_kw": round(sum(r["current_power_w"] for r in ok) / 1e3, 3),
            "energy_today_kwh": round(sum(r["energy_today_kwh"] or 0 for r in rows), 2),
            "energy_total_kwh": round(sum(r["energy_total_kwh"] or 0 for r in rows), 2),
        },
    }
