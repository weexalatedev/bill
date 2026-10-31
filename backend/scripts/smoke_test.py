"""Live smoke test: run against a RUNNING backend with a REAL Octopus account (and optionally Solis).

    python scripts/smoke_test.py --base-url http://localhost:8000 --token $APP_API_TOKEN \
        [--location Manchester] [--solis-id ... --solis-secret ...]

Octopus key and account number are read from OCTOPUS_API_KEY / OCTOPUS_ACCOUNT or prompted (never echoed in args).
Every step prints PASS / FAIL / SKIP / INFO. Exit code is 1 if anything FAILED. Creates a throwaway home and cleans up.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

import httpx


class Skip(Exception):
    pass


def run(client: httpx.Client, api_key: str, account: str, home_id: str = "smoke-test-home",
        location: str = "Manchester", solis: tuple[str, str] | None = None) -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    S: dict = {}

    def step(name, fn):
        try:
            r = fn()
            out.append((name, "PASS", r or ""))
        except Skip as e:
            out.append((name, "SKIP", str(e)))
        except AssertionError as e:
            out.append((name, "FAIL", str(e) or "assertion failed"))
        except Exception as e:  # network errors, bad JSON...
            out.append((name, "FAIL", f"{type(e).__name__}: {e}"))

    def ok(r, code=200):
        assert r.status_code == code, f"HTTP {r.status_code}: {r.text[:200]}"
        return r.json() if r.content else None

    def connect():
        j = ok(client.post("/v1/connections", json={"api_key": api_key, "account_number": account, "home_id": home_id}), 201)
        S["cid"] = j["connection_id"]
        assert j["electricity_meter_points"] + j["gas_meter_points"] > 0, "account has no meter points"
        return f"{j['electricity_meter_points']} electricity, {j['gas_meter_points']} gas meter point(s)"

    def need():
        if "cid" not in S:
            raise Skip("connect failed")
        return S["cid"]

    def readiness():
        j = ok(client.get(f"/v1/connections/{need()}/readiness"))
        S["ready"] = j["status"]
        return f"{j['status']} / {j['mode']}: {j['message']}"

    def account_():
        j = ok(client.get(f"/v1/connections/{need()}/account"))
        cur = [p for p in j["properties"] if p["is_current"]]
        assert cur, "no current property"
        assert any(mp["agreements"] for p in cur for mp in p["electricity_meter_points"]), "no tariff agreement"
        return cur[0]["postcode"] or "ok"

    def dashboard():
        if S.get("ready") in (None, "no_data"):
            raise Skip("no readings yet")
        e = ok(client.get(f"/v1/connections/{need()}/dashboard?days=7"))["electricity"][0]
        assert "error" not in e, e.get("error")
        assert e["intervals"] > 0 and e["total_kwh"] > 0, "no usage returned"
        assert len(e["hourly_profile_kwh"]) == 24
        return f"{e['total_kwh']} kWh, £{e['total_cost_gbp']}, {e['intervals']} intervals (expect ~336 for 7 days), notes={e['notes']}"

    def tariffs():
        t = ok(client.get(f"/v1/connections/{need()}/tariffs"))
        assert t, "no active tariff"
        return f"{t[0]['tariff_code']} unit={t[0].get('unit_rate_p_per_kwh_now')}p standing={t[0].get('standing_charge_p_per_day_now')}p"

    def yesterday():
        if S.get("ready") in (None, "no_data"):
            raise Skip("no readings yet")
        j = ok(client.get(f"/v1/connections/{need()}/yesterday?include_prompt=true&location={location}"))
        assert j["status"] in ("ok", "insufficient_data") and "agent_prompt" in j
        if j["status"] != "ok":
            return "insufficient_data: " + j["message"]
        w = j["weather"]
        return (f"{j['totals']['kwh']} kWh vs normal {j['totals']['baseline_kwh']}; windows={len(j['windows'])}; "
                f"weather={'usable' if w.get('usable') else 'not linked: ' + str(w.get('reason'))}")

    def rate_plan():
        ok(client.put(f"/v1/homes/{home_id}/settings/hardware", json={"timezone": "Europe/London", "site_location": location}))
        j = ok(client.post(f"/v1/homes/{home_id}/rate-plan/sync-from-octopus", params={"connection_id": need()}))
        assert j["import_rates"], "no import periods"
        return f"{j['tariff_code']}: {len(j['import_rates'])} period(s), standing {j['standing_charge_p_per_day']}p"

    def devices():
        j = ok(client.post(f"/v1/homes/{home_id}/devices/refresh"))
        assert j and all(d["status"] == "connected" for d in j), [d["status"] + ": " + d["message"] for d in j]
        return ", ".join(d["name"] for d in j)

    def pause():
        cid = need()
        ok(client.put(f"/v1/homes/{home_id}/settings/pause", json={"home_connections": True, "device_sync": False, "alerts_controls": True}))
        assert client.get(f"/v1/connections/{cid}/tariffs").status_code == 423, "paused home still served data"
        ok(client.put(f"/v1/homes/{home_id}/settings/pause", json={}))
        assert client.get(f"/v1/connections/{cid}/tariffs").status_code == 200, "resume did not restore access"
        return "423 while paused, 200 after resume"

    def live():
        j = ok(client.get(f"/v1/connections/{need()}/live"))
        return "Home Mini found" if j["available"] else "no Home Mini (expected for most customers)"

    def solis_():
        if not solis:
            raise Skip("no Solis credentials given")
        j = ok(client.post("/v1/solis/connections", json={"api_id": solis[0], "api_secret": solis[1], "home_id": home_id}), 201)
        S["sid"] = j["connection_id"]
        d = ok(client.get(f"/v1/solis/connections/{S['sid']}/dashboard"))
        miss = {m for i in d["inverters"] for m in i["missing_fields"]}
        return f"{d['totals']['inverter_count']} inverter(s), {d['totals']['current_power_kw']} kW now; fields missing: {sorted(miss) or 'none'}"

    def cleanup():
        if S.get("cid"):
            assert client.delete(f"/v1/connections/{S['cid']}").status_code == 204
        if S.get("sid"):
            assert client.delete(f"/v1/solis/connections/{S['sid']}").status_code == 204

    for name, fn in [("Connect Octopus", connect), ("Account + tariff agreement", account_), ("Readiness (half-hourly?)", readiness),
                     ("Dashboard (7 days)", dashboard), ("Current tariff + rates", tariffs), ("Explain yesterday + weather", yesterday),
                     ("Rate plan auto-fill", rate_plan), ("Devices refresh", devices), ("Pause blocks, resume restores", pause),
                     ("Live (Home Mini)", live), ("Solis connect + dashboard", solis_), ("Cleanup", cleanup)]:
        step(name, fn)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--token", default=os.environ.get("APP_API_TOKEN"), help="the backend's APP_API_TOKEN")
    ap.add_argument("--location", default="Manchester")
    ap.add_argument("--solis-id")
    ap.add_argument("--solis-secret")
    a = ap.parse_args()
    key = os.environ.get("OCTOPUS_API_KEY") or getpass.getpass("Octopus API key (hidden): ")
    acct = os.environ.get("OCTOPUS_ACCOUNT") or input("Octopus account number (A-XXXXXXXX): ").strip().upper()
    client = httpx.Client(base_url=a.base_url, headers={"Authorization": f"Bearer {a.token}"}, timeout=90)
    res = run(client, key, acct, location=a.location, solis=(a.solis_id, a.solis_secret) if a.solis_id and a.solis_secret else None)
    for name, st, detail in res:
        print(f"{st:5} {name:34} {detail}")
    bad = [r for r in res if r[1] == "FAIL"]
    print(f"\n{len(res) - len(bad)} ok/skipped, {len(bad)} failed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
