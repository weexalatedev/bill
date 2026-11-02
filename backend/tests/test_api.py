import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ["ENCRYPTION_KEY"] = "p7y2Z0m3Qn9m0wq1G1qK0y8o8bq0pYH2cV8N3yq0sXc="
os.environ["APP_API_TOKEN"] = "test-token"
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "t.db")

import httpx
import pytest
from fastapi.testclient import TestClient

from app import octopus
from app.main import app
from app.octopus import parse_tariff_code
from app.service import rate_at

MODE = {"v": "half"}
H = {"Authorization": "Bearer test-token"}
ACCOUNT = {
    "number": "A-1234ABCD",
    "properties": [{
        "id": 1, "moved_in_at": "2020-01-01T00:00:00Z", "moved_out_at": None,
        "address_line_1": "1 Test St", "address_line_2": "", "address_line_3": "", "town": "SURAT",
        "county": "", "postcode": "AB1 2CD",
        "electricity_meter_points": [{
            "mpan": "1000000000000", "profile_class": 1, "consumption_standard": 2560, "is_export": False,
            "meters": [{"serial_number": "OLD", "registers": []}, {"serial_number": "NEW", "registers": []}],
            "agreements": [{"tariff_code": "E-1R-VAR-22-11-01-N", "valid_from": "2020-01-01T00:00:00Z",
                            "valid_to": None}],
        }],
        "gas_meter_points": [],
    }],
}


def mock_octopus(request: httpx.Request) -> httpx.Response:
    p = request.url.path
    if "graphql" in p:
        b = request.content.decode()
        if "obtainKrakenToken" in b:
            return httpx.Response(200, json={"data": {"obtainKrakenToken": {"token": "t"}}})
        if "smartMeterTelemetry" in b:
            return httpx.Response(200, json={"data": {"smartMeterTelemetry": [{"readAt": "x", "demand": 400, "consumption": 3}]}})
        dev = [{"deviceId": "MINI1"}] if MODE["v"] == "mini" else []
        return httpx.Response(200, json={"data": {"account": {"electricityAgreements": [
            {"meterPoint": {"meters": [{"smartDevices": dev}]}}]}}})
    if "/consumption/" in p and MODE["v"] == "empty":
        return httpx.Response(200, json={"count": 0, "next": None, "results": []})
    if "/meters/NEW/consumption/" in p and MODE["v"] == "daily":
        e = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        rows = [{"consumption": 12.0, "interval_start": (e - timedelta(days=i + 1)).isoformat().replace("+00:00", "Z"),
                 "interval_end": (e - timedelta(days=i)).isoformat().replace("+00:00", "Z")} for i in range(3)]
        return httpx.Response(200, json={"count": 3, "next": None, "results": rows})
    if request.headers.get("authorization", "").startswith("Basic") is False and "graphql" not in p:
        return httpx.Response(401)
    if p.endswith("/accounts/A-1234ABCD/"):
        return httpx.Response(200, json=ACCOUNT)
    if p.endswith("/accounts/A-9999ZZZZ/"):
        return httpx.Response(403)
    if "/meters/NEW/consumption/" in p:
        end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        start = end - timedelta(days=9)
        rows, t = [], start
        while t < end:
            rows.append({"consumption": 0.5, "interval_start": t.isoformat().replace("+00:00", "Z"),
                         "interval_end": (t + timedelta(minutes=30)).isoformat().replace("+00:00", "Z")})
            t += timedelta(minutes=30)
        return httpx.Response(200, json={"count": len(rows), "next": None, "results": rows})
    if "/meters/OLD/consumption/" in p:
        return httpx.Response(200, json={"count": 0, "next": None, "results": []})
    if p.endswith("standard-unit-rates/"):
        return httpx.Response(200, json={"count": 1, "next": None, "results": [
            {"value_exc_vat": 20.0, "value_inc_vat": 21.0, "valid_from": "2020-01-01T00:00:00Z", "valid_to": None}]})
    if p.endswith("standing-charges/"):
        return httpx.Response(200, json={"count": 1, "next": None, "results": [
            {"value_exc_vat": 40.0, "value_inc_vat": 42.0, "valid_from": "2020-01-01T00:00:00Z", "valid_to": None}]})
    return httpx.Response(404)


@pytest.fixture()
def client():
    octopus._transport = httpx.MockTransport(mock_octopus)
    with TestClient(app) as c:
        yield c
    octopus._transport = None


def connect(client):
    r = client.post("/v1/connections", headers=H,
                    json={"api_key": "sk_live_abcdefgh", "account_number": "a-1234abcd"})
    assert r.status_code == 201, r.text
    return r.json()["connection_id"]


def test_tariff_code_parsing():
    assert parse_tariff_code("E-1R-AGILE-FLEX-22-11-25-A") == {
        "fuel": "electricity", "register_type": "1R", "product_code": "AGILE-FLEX-22-11-25", "region": "A"}
    assert parse_tariff_code("G-1R-VAR-22-11-01-N")["fuel"] == "gas"


def test_rate_at_open_ended():
    s = [{"value_inc_vat": 10, "valid_from": "2023-01-01T00:00:00Z", "valid_to": None}]
    assert rate_at(s, datetime(2024, 1, 1, tzinfo=timezone.utc)) == 10
    assert rate_at(s, datetime(2022, 1, 1, tzinfo=timezone.utc)) is None


def test_requires_app_token(client):
    assert client.post("/v1/connections", json={}).status_code == 401


def test_bad_account_format_rejected(client):
    r = client.post("/v1/connections", headers=H, json={"api_key": "sk_live_abcdefgh", "account_number": "XYZ"})
    assert r.status_code == 422


def test_wrong_credentials_mapped_to_401(client):
    r = client.post("/v1/connections", headers=H,
                    json={"api_key": "sk_live_abcdefgh", "account_number": "A-9999ZZZZ"})
    assert r.status_code == 401 and "rejected" in r.json()["error"]


def test_connect_encrypts_key(client):
    cid = connect(client)
    from app import db
    with db.connect() as c:
        stored = c.execute("SELECT api_key_enc FROM connections WHERE id=?", (cid,)).fetchone()[0]
    assert "sk_live" not in stored


def test_dashboard_math(client):
    cid = connect(client)
    d = client.get(f"/v1/connections/{cid}/dashboard?days=7", headers=H).json()
    e = d["electricity"][0]
    # 7 days x 48 half-hours x 0.5 kWh = 168 kWh @ 21p = £35.28 ; standing 7 x 42p = £2.94 (DST days are still 48±2 slots)
    assert e["intervals"] > 0 and "error" not in e
    assert e["tariff_codes"] == ["E-1R-VAR-22-11-01-N"]
    assert e["energy_cost_gbp"] == pytest.approx(e["total_kwh"] * 0.21, abs=0.02)
    assert e["standing_charge_gbp"] == pytest.approx(7 * 0.42, abs=0.01)
    assert len(e["hourly_profile_kwh"]) == 24
    assert d["totals"]["cost_gbp"] == pytest.approx(e["total_cost_gbp"])


def test_sync_and_readings(client):
    cid = connect(client)
    s = client.post(f"/v1/connections/{cid}/sync?days=3", headers=H).json()
    assert s["stored_intervals"] > 0
    assert len(client.get(f"/v1/connections/{cid}/readings?limit=10", headers=H).json()) == 10


@pytest.mark.parametrize("mode,status,gran,live", [
    ("half", "ready", "half_hourly", False), ("mini", "ready", "half_hourly", True),
    ("daily", "limited", "daily_or_coarser", False), ("empty", "no_data", None, False)])
def test_readiness_states(client, mode, status, gran, live):
    MODE["v"] = mode
    try:
        cid = connect(client)
        r = client.get(f"/v1/connections/{cid}/readiness", headers=H).json()
    finally:
        MODE["v"] = "half"
    assert (r["status"], r["granularity"], r["live"]["available"]) == (status, gran, live)
    assert r["message"] and (status == "ready") == (r["actions"] == [])
    if mode == "mini":
        assert r["mode"] == "half_hourly_delayed_plus_live"


# ------------------------------------------------ homes: settings, pause, rate-plan sync, devices
def connect_home(client, home="home-1"):
    r = client.post("/v1/connections", headers=H, json={"api_key": "sk_live_abcdefgh",
                    "account_number": "A-1234ABCD", "home_id": home})
    assert r.status_code == 201, r.text
    return r.json()["connection_id"]


def test_hardware_roundtrip_and_total(client):
    body = {"timezone": "Europe/London", "site_location": "Manchester", "solar_setup": "Solis hybrid inverter",
            "solar_panel_kwp": 6.5, "battery_units": 2, "battery_capacity_kwh_per_unit": 5.12}
    assert client.put("/v1/homes/h1/settings/hardware", headers=H, json=body).json()["battery_total_kwh"] == 10.24
    got = client.get("/v1/homes/h1/settings", headers=H).json()
    assert got["hardware"]["solar_panel_kwp"] == 6.5 and got["rate_plan"]["import_rates"] == []


def test_validation_errors(client):
    assert client.put("/v1/homes/h1/settings/hardware", headers=H, json={"timezone": "Mars/Base"}).status_code == 422
    overlap = {"import_rates": [{"name": "a", "start": "00:00", "end": "12:00", "p_per_kwh": 10},
                                {"name": "b", "start": "11:00", "end": "24:00", "p_per_kwh": 20}]}
    assert client.put("/v1/homes/h1/settings/rate-plan", headers=H, json=overlap).status_code == 422
    bad = {"import_rates": [{"name": "a", "start": "10:00", "end": "09:00", "p_per_kwh": 10}]}
    assert client.put("/v1/homes/h1/settings/rate-plan", headers=H, json=bad).status_code == 422
    assert client.get("/v1/homes/bad id!/settings", headers=H).status_code in (404, 422)


def test_rate_plan_coverage(client):
    plan = {"supplier": "Octopus Energy", "standing_charge_p_per_day": 55,
            "import_rates": [{"name": "Night", "start": "00:00", "end": "06:00", "p_per_kwh": 9},
                             {"name": "Day", "start": "06:00", "end": "24:00", "p_per_kwh": 31}]}
    assert client.put("/v1/homes/h2/settings/rate-plan", headers=H, json=plan).json()["import_coverage_pct"] == 100.0


def test_pause_blocks_data_but_not_disconnect(client):
    cid = connect_home(client, "paused-home")
    assert client.get(f"/v1/connections/{cid}/readiness", headers=H).status_code == 200
    r = client.put("/v1/homes/paused-home/settings/pause", headers=H,
                   json={"home_connections": True, "device_sync": False, "alerts_controls": True})
    assert r.json()["effective"] == {"sync_active": False, "alerts_controls_active": True}
    assert client.get(f"/v1/connections/{cid}/dashboard", headers=H).status_code == 423
    refreshed = client.post("/v1/homes/paused-home/devices/refresh", headers=H).json()
    assert refreshed[0]["status"] == "paused"
    client.put("/v1/homes/paused-home/settings/pause", headers=H, json={})   # defaults: all active
    assert client.get(f"/v1/connections/{cid}/dashboard?days=7", headers=H).status_code == 200
    assert client.delete(f"/v1/connections/{cid}", headers=H).status_code == 204


def test_sync_rate_plan_from_octopus(client):
    cid = connect_home(client, "oct-home")
    r = client.post(f"/v1/homes/oct-home/rate-plan/sync-from-octopus?connection_id={cid}", headers=H)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["supplier"] == "Octopus Energy" and j["source"] == "octopus" and j["standing_charge_p_per_day"] == 42
    assert j["import_rates"] == [{"name": "All day", "start": "00:00", "end": "24:00", "p_per_kwh": 21.0}]
    other = connect_home(client, "other-home")
    assert client.post(f"/v1/homes/oct-home/rate-plan/sync-from-octopus?connection_id={other}", headers=H).status_code == 403


def test_devices_list_and_refresh(client):
    cid = connect_home(client, "dev-home")
    assert client.get("/v1/homes/dev-home/devices", headers=H).json()[0]["name"] == "Octopus Energy"
    s = client.post("/v1/homes/dev-home/devices/refresh", headers=H).json()
    assert s[0]["status"] == "connected"


def test_rates_to_periods_merges_and_splits():
    from zoneinfo import ZoneInfo
    from datetime import datetime
    from app.service import rates_to_periods
    tz = ZoneInfo("Europe/London")
    d0, d1 = datetime(2026, 6, 10, 0, tzinfo=tz), datetime(2026, 6, 11, 0, tzinfo=tz)
    rates = [{"value_inc_vat": 30, "valid_from": "2026-06-10T04:30:00Z", "valid_to": None},
             {"value_inc_vat": 9, "valid_from": "2026-06-09T23:00:00Z", "valid_to": "2026-06-10T04:30:00Z"}]
    out = rates_to_periods(rates, d0, d1, tz)
    assert [(p["start"], p["end"], p["p_per_kwh"]) for p in out] == [("00:00", "05:30", 9), ("05:30", "24:00", 30)]


def offline(request: httpx.Request) -> httpx.Response:
    """A provider that cannot be reached at all: DNS/TLS/connection failure."""
    raise httpx.ConnectError("connection refused", request=request)


def test_unreachable_provider_is_502_not_500(client):
    """A network failure must surface as a provider error (502 / status 'error'), never a 500."""
    r = client.post("/v1/connections", headers=H,
                    json={"api_key": "sk_live_abcdefgh", "account_number": "a-1234abcd", "home_id": "net-home"})
    assert r.status_code == 201, r.text
    cid = r.json()["connection_id"]
    octopus._transport = httpx.MockTransport(offline)
    try:
        ready = client.get(f"/v1/connections/{cid}/readiness", headers=H)
        assert ready.status_code == 502, ready.text
        assert "reach Octopus" in ready.json()["error"]

        rows = client.post("/v1/homes/net-home/devices/refresh", headers=H)
        assert rows.status_code == 200, rows.text
        device = rows.json()[0]
        assert device["status"] == "error"
        assert "reach Octopus" in device["message"]
    finally:
        octopus._transport = httpx.MockTransport(mock_octopus)
