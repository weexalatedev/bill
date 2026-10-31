"""Per-home settings that mirror the 1app.energy Settings screens, plus device status.

Hardware tab   -> /settings/hardware   (timezone, site, solar, battery)
Rate Plan tab  -> /settings/rate-plan  (supplier, standing charge, import/export rates)
Pause tab      -> /settings/pause      (home connections, device sync, alerts and controls)
Devices tab    -> /devices, /devices/refresh
`home_id` is YOUR app's own id for the home/site; this service never creates it.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from . import db, service
from .auth import require_app_token
from .crypto import decrypt
from .octopus import OctopusClient
from .providers import store
from .providers.errors import ProviderAuthError, ProviderError
from .providers.solis import SolisClient

HOME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
TIME_RE = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d|24:00")
LABEL = {"octopus": "Octopus Energy", "solis": "Solis Inverter"}


def _mins(v: str) -> int:
    if not TIME_RE.fullmatch(v):
        raise ValueError("Time must be HH:MM (24:00 allowed as end of day)")
    return 1440 if v == "24:00" else int(v[:2]) * 60 + int(v[3:])


class Hardware(BaseModel):
    timezone: str = "Europe/London"
    site_location: str = Field("", max_length=120)
    solar_setup: str | None = Field(None, max_length=80)          # e.g. "Solis hybrid inverter"
    solar_panel_kwp: float = Field(0, ge=0, le=1000)
    battery_units: int = Field(0, ge=0, le=50)
    battery_capacity_kwh_per_unit: float = Field(0, ge=0, le=500)
    battery_source: Literal["manual", "inverter"] = "manual"       # "Manual details are used because the inverter didn't report pack size"

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except Exception:
            raise ValueError("Unknown timezone, use a name like Europe/London")
        return v


class RatePeriod(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    start: str
    end: str
    p_per_kwh: float = Field(ge=0, le=1000)

    @model_validator(mode="after")
    def _order(self):
        if _mins(self.end) <= _mins(self.start):
            raise ValueError("Period end must be after its start")
        return self


class RatePlan(BaseModel):
    supplier: str | None = Field(None, max_length=60)
    standing_charge_p_per_day: float = Field(0, ge=0, le=1000)
    import_rates: list[RatePeriod] = Field(default_factory=list, max_length=96)
    export_rate_p_per_kwh: float = Field(0, ge=0, le=1000)
    source: Literal["manual", "octopus"] = "manual"

    @field_validator("import_rates")
    @classmethod
    def _no_overlap(cls, v: list[RatePeriod]):
        spans = sorted((_mins(p.start), _mins(p.end)) for p in v)
        if any(c < b for (_, b), (c, _) in zip(spans, spans[1:])):
            raise ValueError("Import periods overlap")
        return v


class Appliance(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    power_kw: float = Field(gt=0, le=100)


class Appliances(BaseModel):
    """What the customer says they own. Used only to suggest 'consistent with ...' guesses, never as fact."""
    items: list[Appliance] = Field(default_factory=list, max_length=50)


class Pause(BaseModel):
    home_connections: bool = True
    device_sync: bool = True
    alerts_controls: bool = True


def _get(home: str, section: str, model):
    with db.connect() as c:
        row = c.execute("SELECT data FROM home_settings WHERE home_id=? AND section=?", (home, section)).fetchone()
    return model(**json.loads(row["data"])) if row else model()


def _put(home: str, section: str, obj: BaseModel) -> None:
    with db.connect() as c:
        c.execute("INSERT OR REPLACE INTO home_settings VALUES (?,?,?,?)",
                  (home, section, obj.model_dump_json(), datetime.now(timezone.utc).isoformat()))


def _hw(h: Hardware) -> dict:
    return {**h.model_dump(), "battery_total_kwh": round(h.battery_units * h.battery_capacity_kwh_per_unit, 2)}


def _rp(r: RatePlan) -> dict:
    cov = sum(_mins(p.end) - _mins(p.start) for p in r.import_rates) / 1440 * 100
    return {**r.model_dump(), "import_coverage_pct": round(cov, 1)}


def _pz(p: Pause) -> dict:
    return {**p.model_dump(), "effective": {"sync_active": p.home_connections and p.device_sync,
                                            "alerts_controls_active": p.home_connections and p.alerts_controls}}


def _home(home_id: str) -> str:
    if not HOME_RE.match(home_id):
        raise HTTPException(422, "home_id may use letters, digits, _ . - (max 64 characters)")
    return home_id


router = APIRouter(prefix="/v1/homes/{home_id}", tags=["homes"], dependencies=[Depends(require_app_token)])


@router.get("/settings")
def all_settings(home_id: str = Depends(_home)):
    return {"hardware": _hw(_get(home_id, "hardware", Hardware)),
            "rate_plan": _rp(_get(home_id, "rate_plan", RatePlan)),
            "pause": _pz(_get(home_id, "pause", Pause)),
            "appliances": _get(home_id, "appliances", Appliances).model_dump()}


@router.put("/settings/hardware")
def put_hardware(body: Hardware, home_id: str = Depends(_home)):
    _put(home_id, "hardware", body)
    return _hw(body)


@router.put("/settings/rate-plan")
def put_rate_plan(body: RatePlan, home_id: str = Depends(_home)):
    _put(home_id, "rate_plan", body)
    return _rp(body)


@router.put("/settings/pause")
def put_pause(body: Pause, home_id: str = Depends(_home)):
    _put(home_id, "pause", body)
    return _pz(body)


@router.put("/settings/appliances")
def put_appliances(body: Appliances, home_id: str = Depends(_home)):
    _put(home_id, "appliances", body)
    return body.model_dump()


@router.post("/rate-plan/sync-from-octopus")
def sync_rate_plan(connection_id: str = Query(...), home_id: str = Depends(_home)):
    """'Connect Octopus in Devices to update tariff prices automatically': fills the Rate Plan from Octopus."""
    with db.connect() as c:
        row = c.execute("SELECT account_number, api_key_enc, home_id FROM connections WHERE id=?",
                        (connection_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Unknown connection.")
    if row["home_id"] not in (None, home_id):
        raise HTTPException(403, "That connection belongs to a different home.")
    tz = ZoneInfo(_get(home_id, "hardware", Hardware).timezone)
    now = datetime.now(timezone.utc)
    with OctopusClient(decrypt(row["api_key_enc"])) as client:
        account = service.normalise_account(client.account(row["account_number"]))
        ags = [service.agreement_at(mp["agreements"], now) for mp in service.current_meter_points(account, "electricity")]
        ag = next((a for a in ags if a), None)
        if not ag:
            raise HTTPException(404, "No active electricity tariff found on this account.")
        if ag["register_type"] != "1R":
            raise HTTPException(422, "Multi-rate tariffs (e.g. Economy 7) aren\u2019t supported yet; enter the rates manually.")
        d0 = now.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        rates = client.tariff_series(ag["tariff_code"], "standard-unit-rates", d0, d0 + timedelta(days=1))
        sc = client.tariff_series(ag["tariff_code"], "standing-charges", now - timedelta(days=1), now + timedelta(days=1))
    prev = _get(home_id, "rate_plan", RatePlan)
    plan = RatePlan(supplier="Octopus Energy", standing_charge_p_per_day=service.rate_at(sc, now) or 0,
                    import_rates=service.rates_to_periods(rates, d0, d0 + timedelta(days=1), tz),
                    export_rate_p_per_kwh=prev.export_rate_p_per_kwh, source="octopus")
    _put(home_id, "rate_plan", plan)
    return {**_rp(plan), "tariff_code": ag["tariff_code"],
            "note": "Import periods show today\u2019s prices. Dynamic tariffs (Agile) change daily: re-run to refresh."}


# ---------------------------------------------------------------- devices
def _device_rows(home_id: str) -> list[dict]:
    with db.connect() as c:
        o = c.execute("SELECT id, account_number, api_key_enc, created_at FROM connections WHERE home_id=?", (home_id,)).fetchall()
        p = c.execute("SELECT id, provider, created_at FROM provider_connections WHERE home_id=?", (home_id,)).fetchall()
    return ([{"id": r["id"], "provider": "octopus", "created_at": r["created_at"], "_o": r} for r in o]
            + [{"id": r["id"], "provider": r["provider"], "created_at": r["created_at"]} for r in p])


@router.get("/devices")
def devices(home_id: str = Depends(_home)):
    """Cheap list (no upstream calls): which devices this home has connected."""
    return [{"connection_id": r["id"], "provider": r["provider"], "name": LABEL.get(r["provider"], r["provider"]),
             "created_at": r["created_at"]} for r in _device_rows(home_id)]


@router.post("/devices/refresh")
def refresh_devices(home_id: str = Depends(_home)):
    """The 'Refresh status' button: probes each provider. status = connected | reconnect_required | paused | error."""
    pause = _get(home_id, "pause", Pause)
    out = []
    for r in _device_rows(home_id):
        d = {"connection_id": r["id"], "provider": r["provider"], "name": LABEL.get(r["provider"], r["provider"])}
        if not (pause.home_connections and pause.device_sync):
            out.append({**d, "status": "paused", "message": "Connections are paused for this home."})
            continue
        try:
            if r["provider"] == "octopus":
                with OctopusClient(decrypt(r["_o"]["api_key_enc"])) as c:
                    c.account(r["_o"]["account_number"])
            else:
                creds = store.load(r["id"], r["provider"])
                with SolisClient(creds["api_id"], creds["api_secret"]) as c:
                    c.stations(1, 1)
            out.append({**d, "status": "connected", "message": "Receiving updates."})
        except ProviderAuthError:
            out.append({**d, "status": "reconnect_required", "message": "Credentials stopped working: reconnect this integration."})
        except ProviderError as e:
            out.append({**d, "status": "error", "message": e.message})
    return out
