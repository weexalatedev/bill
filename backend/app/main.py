import uuid
from contextlib import asynccontextmanager
from datetime import date as date_cls, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, SecretStr, field_validator

from . import db, service
from .gate import require_sync_active
from . import explain, homes, weather
from .auth import require_app_token
from .providers import solis
from .providers.errors import ProviderError
from .config import get_settings
from .crypto import decrypt, encrypt
from .octopus import ACCOUNT_RE, OctopusClient, OctopusError


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="EnerOS · device connectors", version="0.2.0", lifespan=lifespan)
app.include_router(solis.router)
app.include_router(homes.router)


@app.exception_handler(ProviderError)
async def provider_error_handler(_, exc: ProviderError):
    return JSONResponse(status_code=exc.status, content={"error": exc.message})


class ConnectRequest(BaseModel):
    api_key: SecretStr
    account_number: str
    home_id: str | None = None   # your app's id for this home; enables per-home pause + settings

    @field_validator("account_number")
    @classmethod
    def _acct(cls, v: str) -> str:
        v = v.strip().upper()
        if not ACCOUNT_RE.match(v):
            raise ValueError("Account number must look like A-XXXXXXXX")
        return v

    @field_validator("api_key")
    @classmethod
    def _key(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value().strip()) < 8:
            raise ValueError("API key looks too short")
        return SecretStr(v.get_secret_value().strip())


def _load(connection_id: str) -> tuple[str, str]:
    with db.connect() as c:
        row = c.execute("SELECT account_number, api_key_enc FROM connections WHERE id=?",
                        (connection_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Unknown connection.")
    return row["account_number"], decrypt(row["api_key_enc"])


def _account(client: OctopusClient, account_number: str) -> dict:
    return service.normalise_account(client.account(account_number))


# ------------------------------------------------------------- connections
@app.post("/v1/connections", status_code=201, dependencies=[Depends(require_app_token)])
def connect(body: ConnectRequest):
    """The 'Connect Device' button. Validates the credentials against Octopus, then stores them encrypted."""
    key = body.api_key.get_secret_value()
    with OctopusClient(key) as client:
        account = _account(client, body.account_number)  # raises 401/404 if credentials are wrong
    conn_id = str(uuid.uuid4())
    with db.connect() as c:
        c.execute("INSERT INTO connections (id, home_id, account_number, api_key_enc, created_at) VALUES (?,?,?,?,?)",
                  (conn_id, body.home_id, body.account_number, encrypt(key), datetime.now(timezone.utc).isoformat()))
    current = [p for p in account["properties"] if p["is_current"]]
    return {
        "connection_id": conn_id,
        "account_number": account["account_number"],
        "properties": len(current),
        "electricity_meter_points": sum(len(p["electricity_meter_points"]) for p in current),
        "gas_meter_points": sum(len(p["gas_meter_points"]) for p in current),
    }


@app.delete("/v1/connections/{connection_id}", status_code=204, dependencies=[Depends(require_app_token)])
def disconnect(connection_id: str):
    with db.connect() as c:
        c.execute("DELETE FROM readings WHERE connection_id=?", (connection_id,))
        c.execute("DELETE FROM connections WHERE id=?", (connection_id,))


# ------------------------------------------------------------------- reads
@app.get("/v1/connections/{connection_id}/account", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def get_account(connection_id: str):
    """Normalised: properties -> meter points -> meters + tariff agreements."""
    acct, key = _load(connection_id)
    with OctopusClient(key) as client:
        return _account(client, acct)


@app.get("/v1/connections/{connection_id}/raw/account", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def get_raw_account(connection_id: str):
    """Octopus's untouched JSON, for debugging or when you want fields we don't map."""
    acct, key = _load(connection_id)
    with OctopusClient(key) as client:
        return client.account(acct)


@app.get("/v1/connections/{connection_id}/consumption", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def get_consumption(
    connection_id: str,
    fuel: str = Query("electricity", pattern="^(electricity|gas)$"),
    days: int = Query(2, ge=1, le=366),
    group_by: str | None = Query(None, pattern="^(hour|day|week|month|quarter)$"),
    mpxn: str | None = None,
    serial: str | None = None,
):
    """Half-hourly (or grouped) usage. If mpxn/serial are omitted, every current meter is used."""
    acct, key = _load(connection_id)
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    with OctopusClient(key) as client:
        account = _account(client, acct)
        results = []
        for mp in service.current_meter_points(account, fuel):
            id_ = mp["mpan"] if fuel == "electricity" else mp["mprn"]
            if mpxn and mpxn != id_:
                continue
            for m in mp["meters"]:
                if serial and serial != m["serial_number"]:
                    continue
                rows = client.consumption(fuel, id_, m["serial_number"], start, end, group_by)
                if rows:
                    results.append({"mpxn": id_, "serial_number": m["serial_number"], "results": rows})
    return {"fuel": fuel, "from": start.isoformat(), "to": end.isoformat(), "meters": results}


@app.get("/v1/connections/{connection_id}/tariffs", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def get_tariffs(connection_id: str):
    """Each current meter point's active tariff with today's unit rate(s) and standing charge."""
    acct, key = _load(connection_id)
    now = datetime.now(timezone.utc)
    out = []
    with OctopusClient(key) as client:
        account = _account(client, acct)
        for fuel in ("electricity", "gas"):
            for mp in service.current_meter_points(account, fuel):
                ag = service.agreement_at(mp["agreements"], now)
                if not ag:
                    continue
                entry = {"fuel": fuel, "mpxn": mp.get("mpan") or mp.get("mprn"), **{
                    k: ag[k] for k in ("tariff_code", "product_code", "register_type", "valid_from", "valid_to")}}
                if ag["register_type"] == "1R":
                    rates = client.tariff_series(ag["tariff_code"], "standard-unit-rates",
                                                 now - timedelta(days=1), now + timedelta(days=1))
                    sc = client.tariff_series(ag["tariff_code"], "standing-charges",
                                              now - timedelta(days=1), now + timedelta(days=1))
                    entry["unit_rate_p_per_kwh_now"] = service.rate_at(rates, now)
                    entry["standing_charge_p_per_day_now"] = service.rate_at(sc, now)
                    entry["upcoming_unit_rates"] = [r for r in rates if service.parse_dt(r["valid_from"]) > now][:48]
                out.append(entry)
    return out


@app.get("/v1/connections/{connection_id}/dashboard", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def dashboard(
    connection_id: str,
    days: int = Query(30, ge=1, le=366),
    gas_unit: str = Query("kwh", pattern="^(kwh|m3)$"),
):
    """Ready-to-chart: totals, cost, daily series, hourly profile, peak, baseload, anomalous days."""
    acct, key = _load(connection_id)
    with OctopusClient(key) as client:
        return service.build_dashboard(client, _account(client, acct), days, gas_unit)


@app.get("/v1/connections/{connection_id}/readiness", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def readiness(connection_id: str):
    """Call right after connect: half-hourly or not, how stale, and whether a Home Mini gives live data."""
    acct, key = _load(connection_id)
    with OctopusClient(key) as client:
        return service.assess_readiness(client, _account(client, acct))


@app.get("/v1/connections/{connection_id}/yesterday", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def yesterday(connection_id: str, date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
              location: str | None = None, include_prompt: bool = False):
    """Explain one day (default: yesterday): vs the customer's usual pattern, weather, unusual windows,
    findings labelled measured / estimated / guess. Needs half-hourly readings (see /readiness)."""
    acct, key = _load(connection_id)
    with db.connect() as c:
        row = c.execute("SELECT home_id FROM connections WHERE id=?", (connection_id,)).fetchone()
    home = row["home_id"] if row else None
    hw = homes._get(home, "hardware", homes.Hardware) if home else homes.Hardware()
    tz = ZoneInfo(hw.timezone)
    today = datetime.now(timezone.utc).astimezone(tz).date()
    target = date_cls.fromisoformat(date) if date else today - timedelta(days=1)
    if target >= today:
        raise HTTPException(422, "Pick a day before today: today\u2019s readings are incomplete.")
    start = datetime.combine(target - timedelta(days=30), datetime.min.time(), tz)
    end = datetime.combine(target + timedelta(days=1), datetime.min.time(), tz)
    now = datetime.now(timezone.utc)
    with OctopusClient(key) as client:
        account = _account(client, acct)
        mps = service.current_meter_points(account, "electricity")
        if not mps:
            raise HTTPException(404, "No electricity meter point found on this account.")
        mp = mps[0]
        intervals: dict = {}
        for m in mp["meters"]:
            for r in client.consumption("electricity", mp["mpan"], m["serial_number"], start, end):
                intervals[service.parse_dt(r["interval_start"])] = r["consumption"]
        ag = service.agreement_at(mp["agreements"], end - timedelta(seconds=1)) or service.agreement_at(mp["agreements"], now)
        rates, standing = [], []
        if ag and ag["register_type"] == "1R":
            rates = client.tariff_series(ag["tariff_code"], "standard-unit-rates", start, end)
            standing = client.tariff_series(ag["tariff_code"], "standing-charges", start, end)
    sc = service.rate_at(standing, end - timedelta(hours=12)) if standing else None
    temps, note = None, None
    place = location or hw.site_location
    if not place:
        note = "No site location set (Hardware \u2192 Site location), so weather can\u2019t be fetched."
    else:
        try:
            geo = weather.geocode(place)
            if geo is None:
                note = f"Couldn\u2019t find \u2018{place}\u2019 for the weather lookup."
            else:
                temps = weather.hourly_temps(geo[0], geo[1], hw.timezone, (today - start.date()).days + 1)
        except weather.WeatherError as e:
            note = e.message
    apps = homes._get(home, "appliances", homes.Appliances).model_dump()["items"] if home else []
    out = explain.build_explanation(target=target, tz=tz, intervals=intervals,
                                    rate_p=lambda t: service.rate_at(rates, t), standing_p_per_day=sc,
                                    temps=temps, weather_note=note, appliances=apps)
    if ag and ag["register_type"] != "1R":
        out.setdefault("data_quality", {})["pricing_note"] = "Multi-rate tariff: cost is not estimated."
    if include_prompt:
        out["agent_prompt"] = explain.agent_prompt(out)
    return out


@app.get("/v1/connections/{connection_id}/live", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def live(connection_id: str):
    """Near-real-time demand via GraphQL. Needs an Octopus Home Mini (or similar) on the account."""
    acct, key = _load(connection_id)
    with OctopusClient(key) as client:
        return client.live_telemetry(acct)


# --------------------------------------------------------- local history
@app.post("/v1/connections/{connection_id}/sync", dependencies=[Depends(require_app_token), Depends(require_sync_active)])
def sync(connection_id: str, days: int = Query(30, ge=1, le=366)):
    """Pull half-hourly readings into our own DB: the base for forecasting/ML and long history."""
    acct, key = _load(connection_id)
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    stored = 0
    with OctopusClient(key) as client:
        account = _account(client, acct)
        rows = []
        for fuel in ("electricity", "gas"):
            for mp in service.current_meter_points(account, fuel):
                id_ = mp["mpan"] if fuel == "electricity" else mp["mprn"]
                for m in mp["meters"]:
                    for r in client.consumption(fuel, id_, m["serial_number"], start, end):
                        rows.append((connection_id, fuel, id_, m["serial_number"],
                                     service.parse_dt(r["interval_start"]).isoformat(),
                                     service.parse_dt(r["interval_end"]).isoformat(), r["consumption"]))
    with db.connect() as c:
        c.executemany("INSERT OR REPLACE INTO readings VALUES (?,?,?,?,?,?,?)", rows)
        c.execute("UPDATE connections SET last_sync_at=? WHERE id=?", (end.isoformat(), connection_id))
        stored = len(rows)
    return {"stored_intervals": stored, "from": start.isoformat(), "to": end.isoformat()}


@app.get("/v1/connections/{connection_id}/readings", dependencies=[Depends(require_app_token)])
def stored_readings(connection_id: str, limit: int = Query(500, ge=1, le=20000)):
    _load(connection_id)
    with db.connect() as c:
        rows = c.execute("SELECT fuel,mpxn,serial,interval_start,interval_end,consumption FROM readings "
                         "WHERE connection_id=? ORDER BY interval_start DESC LIMIT ?",
                         (connection_id, limit)).fetchall()
    return [dict(r) for r in rows]
