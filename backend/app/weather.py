"""Hourly weather for a site, from Open-Meteo (geocoding + forecast API with past_days, up to 92 days back).
Licence: the free endpoints are for NON-commercial use. Commercial deployments must set OPEN_METEO_API_KEY."""
from __future__ import annotations

import httpx

from . import db
from .config import get_settings
from .providers.errors import ProviderError

_transport: httpx.BaseTransport | None = None  # tests inject a mock here
GEO_URL = "https://geocoding-api.open-meteo.com/v1/search"


class WeatherError(ProviderError):
    status = 502


def _client() -> httpx.Client:
    return httpx.Client(timeout=20, transport=_transport, headers={"User-Agent": "EnerOS/0.2"})


def geocode(place: str) -> tuple[float, float, str] | None:
    key = place.strip().lower()
    with db.connect() as c:
        row = c.execute("SELECT lat, lon, name FROM geo_cache WHERE query=?", (key,)).fetchone()
    if row:
        return row["lat"], row["lon"], row["name"]
    try:
        with _client() as h:
            r = h.get(GEO_URL, params={"name": place, "count": 1, "language": "en", "format": "json"})
        r.raise_for_status()
        hit = (r.json().get("results") or [None])[0]
    except (httpx.HTTPError, ValueError) as e:
        raise WeatherError(f"Weather location lookup failed: {e.__class__.__name__}")
    if not hit:
        return None
    name = ", ".join(x for x in (hit.get("name"), hit.get("admin1"), hit.get("country")) if x)
    with db.connect() as c:
        c.execute("INSERT OR REPLACE INTO geo_cache VALUES (?,?,?,?)", (key, hit["latitude"], hit["longitude"], name))
    return hit["latitude"], hit["longitude"], name


def hourly_temps(lat: float, lon: float, tz: str, past_days: int) -> dict[str, list[float | None]]:
    """{ 'YYYY-MM-DD': [24 hourly temperatures in °C, local time] } for the last `past_days` days plus today."""
    s = get_settings()
    base = ("https://customer-api.open-meteo.com/v1/forecast" if s.open_meteo_api_key
            else "https://api.open-meteo.com/v1/forecast")
    params = {"latitude": lat, "longitude": lon, "hourly": "temperature_2m", "timezone": tz,
              "past_days": min(past_days, 92), "forecast_days": 1}
    if s.open_meteo_api_key:
        params["apikey"] = s.open_meteo_api_key
    try:
        with _client() as h:
            r = h.get(base, params=params)
        r.raise_for_status()
        hourly = r.json()["hourly"]
        times, temps = hourly["time"], hourly["temperature_2m"]
    except (httpx.HTTPError, KeyError, ValueError) as e:
        raise WeatherError(f"Weather lookup failed: {e.__class__.__name__}")
    out: dict[str, list[float | None]] = {}
    for t, v in zip(times, temps):          # t = '2026-10-29T14:00' (local time)
        out.setdefault(t[:10], [None] * 24)[int(t[11:13])] = v
    return out
