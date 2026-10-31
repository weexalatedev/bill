import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest

import test_api  # sets env vars, provides mock Octopus + fixtures
from test_api import H, client, connect_home  # noqa: F401
from app import explain, weather

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import smoke_test  # noqa: E402

TZ = ZoneInfo("Europe/London")
TARGET = date(2026, 6, 10)


def scenario(extra_night=4.0, target_temp=6.0):
    """30 baseline days where usage = fixed + 1.2 kWh per heating degree-day; target day is colder and has overnight extra."""
    intervals, temps = {}, {}
    for back in range(0, 31):
        d = TARGET - timedelta(days=back)
        t = target_temp if back == 0 else 12 + 4 * math.sin(back)
        temps[d.isoformat()] = [t] * 24
        hdd = max(0, explain.HDD_BASE_C - t)
        for h in range(24):
            for m in (0, 30):
                kwh = (0.2 if h < 6 else 0.6) + 1.2 * hdd / 48
                if back == 0 and 1 <= h < 5:
                    kwh += extra_night / 8
                loc = datetime(d.year, d.month, d.day, h, m, tzinfo=TZ)
                intervals[loc.astimezone(timezone.utc)] = kwh
    return intervals, temps


def run(intervals, temps, **kw):
    return explain.build_explanation(target=TARGET, tz=TZ, intervals=intervals, rate_p=lambda t: 30.0,
                                     standing_p_per_day=50.0, temps=temps, weather_note=None, **kw)


def test_ols_edge_cases():
    assert explain.ols([1, 1, 1, 1], [1, 2, 3, 4]) is None
    b, a, r2 = explain.ols([0, 1, 2, 3], [1, 3, 5, 7])
    assert (round(b, 6), round(a, 6), round(r2, 6)) == (2, 1, 1)


def test_weather_and_overnight_window_separated():
    iv, tp = scenario()
    r = run(iv, tp)
    assert r["status"] == "ok"
    w = r["weather"]
    assert w["usable"] and w["slope_kwh_per_degree_day"] == pytest.approx(1.2, abs=0.05) and w["r2"] > 0.95
    # colder day: weather share is estimated from the fitted slope, the remainder is the overnight extra
    assert w["explained_delta_kwh"] > 3
    assert r["totals"]["delta_kwh"] == pytest.approx(w["explained_delta_kwh"] + r["totals"]["unexplained_kwh"], abs=0.01)
    win = r["windows"][0]
    assert win["start"] == "01:00" and win["end"] == "05:00" and win["overnight"] and 3.5 <= win["excess_kwh"] <= 6.5
    labels = {f["evidence"] for f in r["findings"]}
    assert labels == {"measured", "estimated", "guess"}
    assert all(f["evidence"] in ("measured", "estimated", "guess") for f in r["findings"])
    assert r["totals"]["cost_gbp"] == pytest.approx(r["totals"]["kwh"] * 0.30 + 0.50, abs=0.02)


def test_no_weather_never_blames_weather():
    iv, _ = scenario()
    r = explain.build_explanation(target=TARGET, tz=TZ, intervals=iv, rate_p=lambda t: 30.0, standing_p_per_day=50.0,
                                  temps=None, weather_note="No site location set.")
    assert not r["weather"]["available"] and r["totals"]["unexplained_kwh"] == r["totals"]["delta_kwh"]
    assert not any(f["evidence"] == "estimated" for f in r["findings"])


def test_short_history_refuses_weather_claim():
    iv, tp = scenario()
    cut = {t: v for t, v in iv.items() if t.astimezone(TZ).date() > TARGET - timedelta(days=8)}
    r = run(cut, tp)
    assert r["status"] == "ok" and r["weather"]["available"] and not r["weather"]["usable"] and "days of history" in r["weather"]["reason"]


def test_insufficient_data():
    assert run({}, None)["status"] == "insufficient_data"
    iv, tp = scenario()
    one = {t: v for t, v in iv.items() if t.astimezone(TZ).date() >= TARGET - timedelta(days=1)}
    assert run(one, tp)["status"] == "insufficient_data"


def test_normal_day_says_so():
    # a day whose weather equals the average of the comparable (weekday) baseline days, with no overnight extra
    days = [TARGET - timedelta(days=b) for b in range(1, 31)]
    hdds = [max(0, explain.HDD_BASE_C - (12 + 4 * math.sin(b))) for b, d in zip(range(1, 31), days) if d.weekday() < 5]
    iv, tp = scenario(extra_night=0.0, target_temp=explain.HDD_BASE_C - sum(hdds) / len(hdds))
    r = run(iv, tp)
    assert r["windows"] == [] and any(f["title"] == "A normal day" for f in r["findings"])


def test_appliance_matching_is_guess_only():
    apps = [{"name": "Oven", "power_kw": 3.0}, {"name": "Fridge", "power_kw": 0.4}, {"name": "Fan", "power_kw": 0.6}]
    assert explain.match_appliances(1.0, apps) == ["Fridge + Fan (1.00 kW)"]
    iv, tp = scenario()
    avg = run(iv, tp)["windows"][0]["avg_excess_kw"]
    r = run(iv, tp, appliances=[{"name": "Heater", "power_kw": avg}])
    g = [f for f in r["findings"] if f["evidence"] == "guess"][0]
    assert "Heater" in g["detail"] and "can’t tell which" in g["detail"]


def wx_handler(request: httpx.Request) -> httpx.Response:
    if "geocoding" in request.url.host:
        return httpx.Response(200, json={"results": [{"name": "Manchester", "latitude": 53.48, "longitude": -2.24,
                                                      "country": "United Kingdom", "admin1": "England"}]})
    today = datetime.now(timezone.utc).date()
    times = [f"{today - timedelta(days=i)}T{h:02d}:00" for i in range(40, -1, -1) for h in range(24)]
    return httpx.Response(200, json={"hourly": {"time": times, "temperature_2m": [10.0] * len(times)}})


def test_weather_module_parses_and_caches(client):
    weather._transport = httpx.MockTransport(wx_handler)
    try:
        assert weather.geocode("Manchester")[2].startswith("Manchester")
        weather._transport = httpx.MockTransport(lambda r: httpx.Response(500))   # cached: no second lookup needed
        assert weather.geocode("manchester") is not None
        weather._transport = httpx.MockTransport(wx_handler)
        t = weather.hourly_temps(53.48, -2.24, "Europe/London", 10)
        assert len(next(iter(t.values()))) == 24
    finally:
        weather._transport = None


def test_yesterday_endpoint_end_to_end(client):
    weather._transport = httpx.MockTransport(wx_handler)
    try:
        cid = connect_home(client, "y-home")
        target = (datetime.now(timezone.utc).date() - timedelta(days=2)).isoformat()   # inside the mock's 9 days of data
        r = client.get(f"/v1/connections/{cid}/yesterday?date={target}&location=Manchester&include_prompt=true", headers=H)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "ok" and j["weather"]["available"] and not j["weather"]["usable"]
        assert abs(j["totals"]["delta_kwh"]) < 0.5 and "DATA:" in j["agent_prompt"]
        assert client.get(f"/v1/connections/{cid}/yesterday?date={datetime.now().date()}", headers=H).status_code == 422
        # no location saved and none given -> still works, says why weather is missing
        r2 = client.get(f"/v1/connections/{cid}/yesterday?date={target}", headers=H).json()
        assert not r2["weather"]["available"] and "Site location" in r2["weather"]["reason"]
    finally:
        weather._transport = None


def test_smoke_script_passes_against_mocks(client):
    client.headers.update(H)
    weather._transport = httpx.MockTransport(wx_handler)
    try:
        res = smoke_test.run(client, "sk_live_abcdefgh", "A-1234ABCD", home_id="smoke-home")
    finally:
        weather._transport = None
    failed = [r for r in res if r[1] == "FAIL"]
    assert not failed, failed
    assert {r[0] for r in res if r[1] == "PASS"} >= {"Connect Octopus", "Pause blocks, resume restores", "Rate plan auto-fill", "Cleanup"}


def test_cold_day_alone_creates_no_unusual_windows():
    """Regression: heating on a cold day is explained by weather and must not show up as 'unusual' hours."""
    iv, tp = scenario(extra_night=0.0, target_temp=2.0)
    r = run(iv, tp)
    assert r["weather"]["usable"] and r["weather"]["explained_delta_kwh"] > 5
    assert r["windows"] == []
