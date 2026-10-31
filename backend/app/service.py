"""Turns Octopus's raw responses into dashboard-ready data."""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from .octopus import OctopusClient, OctopusError, OctopusNotFound, parse_tariff_code

LONDON = ZoneInfo("Europe/London")
GAS_M3_TO_KWH = 11.22  # approx. (volume correction 1.02264 x CV ~39.5 MJ/m3 / 3.6); SMETS2 gas reports m3


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


# ------------------------------------------------------------------ account
def _agreements(raw: list[dict], now: datetime) -> list[dict]:
    out = []
    for a in raw:
        vf, vt = parse_dt(a["valid_from"]), parse_dt(a.get("valid_to"))
        info = parse_tariff_code(a["tariff_code"])
        out.append({
            "tariff_code": a["tariff_code"],
            "product_code": info["product_code"],
            "register_type": info["register_type"],   # 1R = single rate, 2R = Economy 7 style
            "region": info["region"],
            "valid_from": vf, "valid_to": vt,
            "is_active": vf <= now and (vt is None or vt > now),
        })
    return out


def normalise_account(raw: dict, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    props = []
    for p in raw.get("properties", []):
        elec = [{
            "mpan": mp["mpan"], "is_export": mp.get("is_export", False),
            "profile_class": mp.get("profile_class"),
            "estimated_annual_kwh": mp.get("consumption_standard"),
            "meters": [{"serial_number": m["serial_number"], "registers": m.get("registers", [])}
                       for m in mp.get("meters", [])],
            "agreements": _agreements(mp.get("agreements", []), now),
        } for mp in p.get("electricity_meter_points", [])]
        gas = [{
            "mprn": mp["mprn"], "estimated_annual_kwh": mp.get("consumption_standard"),
            "meters": [{"serial_number": m["serial_number"]} for m in mp.get("meters", [])],
            "agreements": _agreements(mp.get("agreements", []), now),
        } for mp in p.get("gas_meter_points", [])]
        props.append({
            "id": p["id"], "moved_in_at": p.get("moved_in_at"), "moved_out_at": p.get("moved_out_at"),
            "is_current": p.get("moved_out_at") is None,
            "address": ", ".join(x for x in (p.get("address_line_1"), p.get("address_line_2"),
                                             p.get("address_line_3"), p.get("town"), p.get("county")) if x),
            "postcode": p.get("postcode"),
            "electricity_meter_points": elec, "gas_meter_points": gas,
        })
    return {"account_number": raw["number"], "properties": props}


def current_meter_points(account: dict, fuel: str) -> list[dict]:
    key = "electricity_meter_points" if fuel == "electricity" else "gas_meter_points"
    out = []
    for p in account["properties"]:
        if p["is_current"]:
            out += [mp for mp in p[key] if not mp.get("is_export")]
    return out


# ------------------------------------------------------------------ pricing
def rate_at(series: list[dict], t: datetime) -> float | None:
    """Price (pence, inc VAT) valid at instant t. valid_to null = still active."""
    for r in series:
        vf, vt = parse_dt(r["valid_from"]), parse_dt(r.get("valid_to"))
        if vf <= t and (vt is None or t < vt):
            return r["value_inc_vat"]
    return None


def agreement_at(agreements: list[dict], t: datetime) -> dict | None:
    for a in agreements:
        if a["valid_from"] <= t and (a["valid_to"] is None or t < a["valid_to"]):
            return a
    return None


# ------------------------------------------------------------ dashboard maths
def summarise_meter_point(
    client: OctopusClient, fuel: str, mp: dict, start: datetime, end: datetime,
    gas_unit: str = "kwh",
) -> dict[str, Any]:
    mpxn = mp["mpan"] if fuel == "electricity" else mp["mprn"]
    factor = GAS_M3_TO_KWH if (fuel == "gas" and gas_unit == "m3") else 1.0

    # Merge all meters at the point (old meters simply return nothing), de-duplicate by interval.
    intervals: dict[datetime, dict] = {}
    for m in mp["meters"]:
        for r in client.consumption(fuel, mpxn, m["serial_number"], start, end):
            intervals[parse_dt(r["interval_start"])] = {"kwh": r["consumption"] * factor}

    notes: list[str] = []
    tariffs_used = {agreement_at(mp["agreements"], t)["tariff_code"]
                    for t in intervals if agreement_at(mp["agreements"], t)}
    unit_rates: dict[str, list[dict]] = {}
    standing: dict[str, list[dict]] = {}
    for code in tariffs_used:
        if parse_tariff_code(code)["register_type"] != "1R":
            notes.append(f"{code}: multi-rate tariff, cost not estimated yet.")
            continue
        try:
            unit_rates[code] = client.tariff_series(code, "standard-unit-rates", start, end)
            standing[code] = client.tariff_series(code, "standing-charges", start, end)
        except OctopusNotFound:
            notes.append(f"{code}: tariff prices not found.")

    daily_kwh: dict[str, float] = defaultdict(float)
    daily_pence: dict[str, float] = defaultdict(float)
    hourly: dict[int, float] = defaultdict(float)
    energy_pence, priced, unpriced = 0.0, 0, 0
    for t, row in intervals.items():
        local = t.astimezone(LONDON)
        day = local.date().isoformat()
        daily_kwh[day] += row["kwh"]
        hourly[local.hour] += row["kwh"]
        ag = agreement_at(mp["agreements"], t)
        rate = rate_at(unit_rates.get(ag["tariff_code"], []), t) if ag else None
        if rate is None:
            unpriced += 1
        else:
            priced += 1
            energy_pence += row["kwh"] * rate
            daily_pence[day] += row["kwh"] * rate

    # Standing charge: pence/day, one charge per local calendar day in the window
    standing_pence, d = 0.0, start.astimezone(LONDON)
    while d < end.astimezone(LONDON):
        day_start = d.astimezone(timezone.utc)
        ag = agreement_at(mp["agreements"], day_start)
        sc = rate_at(standing.get(ag["tariff_code"], []), day_start) if ag else None
        if sc is not None:
            standing_pence += sc
            daily_pence[d.date().isoformat()] += sc
        d = (d + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    kwh_series = [v["kwh"] for v in intervals.values()]
    total_kwh = sum(kwh_series)
    n_days = max(len(daily_kwh), 1)
    daily = [{"date": k, "kwh": round(v, 3), "cost_gbp": round(daily_pence.get(k, 0) / 100, 2)}
             for k, v in sorted(daily_kwh.items())]

    anomalies = []
    if len(daily) >= 7:
        vals = [x["kwh"] for x in daily]
        mu, sd = statistics.mean(vals), statistics.pstdev(vals)
        anomalies = [x for x in daily if sd > 0 and x["kwh"] > mu + 2 * sd]

    peak = max(intervals.items(), key=lambda kv: kv[1]["kwh"], default=None)
    low = sorted(kwh_series)[: max(1, len(kwh_series) // 20)]
    if unpriced:
        notes.append(f"{unpriced} intervals had no matching price and are excluded from cost.")

    return {
        "fuel": fuel, "mpxn": mpxn,
        "tariff_codes": sorted(tariffs_used),
        "intervals": len(intervals),
        "total_kwh": round(total_kwh, 2),
        "energy_cost_gbp": round(energy_pence / 100, 2),
        "standing_charge_gbp": round(standing_pence / 100, 2),
        "total_cost_gbp": round((energy_pence + standing_pence) / 100, 2),
        "avg_unit_price_p_per_kwh": round(energy_pence / total_kwh, 2) if total_kwh and priced else None,
        "daily": daily,
        "hourly_profile_kwh": [round(hourly.get(h, 0) / n_days, 3) for h in range(24)],
        "peak_half_hour": {"start": peak[0].isoformat(), "kwh": round(peak[1]["kwh"], 3)} if peak else None,
        "baseload_kw": round(statistics.mean(low) * 2, 3) if low and kwh_series else None,
        "anomalous_days": anomalies,
        "notes": notes,
    }


def build_dashboard(
    client: OctopusClient, account: dict, days: int, gas_unit: str = "kwh",
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    end_local = now.astimezone(LONDON).replace(hour=0, minute=0, second=0, microsecond=0)
    start_local = end_local - timedelta(days=days)   # whole days ending at today 00:00 (data lags ~1 day)
    start, end = start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)
    out: dict[str, Any] = {
        "account_number": account["account_number"],
        "period": {"from": start.isoformat(), "to": end.isoformat(), "days": days, "timezone": "Europe/London"},
        "electricity": [], "gas": [],
        "data_mode": "delayed",  # REST usage lags about a day; live data is the separate /live endpoint
    }
    for fuel in ("electricity", "gas"):
        for mp in current_meter_points(account, fuel):
            try:
                out[fuel].append(summarise_meter_point(client, fuel, mp, start, end, gas_unit))
            except OctopusError as e:
                out[fuel].append({"mpxn": mp.get("mpan") or mp.get("mprn"), "error": e.message})
    ok = [s for f in ("electricity", "gas") for s in out[f] if "error" not in s]
    out["totals"] = {
        "kwh": round(sum(s["total_kwh"] for s in ok), 2),
        "cost_gbp": round(sum(s["total_cost_gbp"] for s in ok), 2),
    }
    return out


# ------------------------------------------------------------- data readiness
def _assess_point(mpxn: str, rows: dict, now: datetime) -> dict[str, Any]:
    if not rows:
        return {"mpxn": mpxn, "status": "no_data", "granularity": None, "coverage_pct": 0,
                "latest_reading_end": None, "data_age_hours": None}
    lens = sorted((e - s).total_seconds() for s, e in rows.items())
    med = lens[len(lens) // 2]
    gran = "half_hourly" if med <= 3600 else "daily_or_coarser" if med >= 43200 else "other"
    first, last = min(rows), max(rows.values())
    cov = min(100.0, len(rows) / max(1.0, (last - first).total_seconds() / 1800) * 100) if gran == "half_hourly" else None
    age = (now - last).total_seconds() / 3600
    ok = gran == "half_hourly" and cov >= 80 and age <= 36
    return {"mpxn": mpxn, "status": "ready" if ok else "limited", "granularity": gran,
            "coverage_pct": round(cov, 1) if cov is not None else None,
            "latest_reading_end": last.isoformat(), "data_age_hours": round(age, 1)}


def _probe_live(client: OctopusClient, account_number: str) -> dict[str, Any]:
    try:
        r = client.live_telemetry(account_number)
        return {"available": True, "device_id": r["device_id"]} if r["available"] else \
            {"available": False, "reason": r["reason"]}
    except Exception:  # best-effort probe: never let it break the readiness answer
        return {"available": False, "reason": "Couldn\u2019t check for a Home Mini."}


def assess_readiness(client: OctopusClient, account: dict, now: datetime | None = None) -> dict[str, Any]:
    """Can we analyse this customer, and is the data delayed (REST) or live (Home Mini)?"""
    now = now or datetime.now(timezone.utc)
    start, pts = now - timedelta(days=3), []
    for mp in current_meter_points(account, "electricity"):
        rows: dict = {}
        for m in mp["meters"]:
            for r in client.consumption("electricity", mp["mpan"], m["serial_number"], start, now):
                rows[parse_dt(r["interval_start"])] = parse_dt(r["interval_end"])
        pts.append(_assess_point(mp["mpan"], rows, now))
    live = _probe_live(client, account["account_number"])
    order = {"no_data": 0, "limited": 1, "ready": 2}
    worst = min(pts, key=lambda x: order[x["status"]]) if pts else {"status": "no_data", "granularity": None,
            "coverage_pct": 0, "latest_reading_end": None, "data_age_hours": None}
    st, gran, age = worst["status"], worst["granularity"], worst["data_age_hours"]
    if st == "no_data":
        mode, msg = "none", ("No smart meter readings found yet. After a new install or switch it can take up to "
                             "about two weeks for readings to start. There is nothing to analyse until then.")
        actions = ["Wait for the first readings to appear in the Octopus account", "Send a manual reading meanwhile"]
    elif gran != "half_hourly":
        mode, msg = "daily_only", ("Readings arrive less often than every half hour, so hourly patterns, "
                                   "baseload and peaks can\u2019t be calculated.")
        actions = ["Ask the customer to turn on half-hourly readings in their Octopus account",
                   "Re-check after the next day\u2019s readings"]
    else:
        mode = "half_hourly_delayed_plus_live" if live["available"] else "half_hourly_delayed"
        msg = (f"Half-hourly readings, about {age:.0f} hours behind. Analysis uses data up to the last full day."
               + (" Live demand is also available from the Home Mini." if live["available"] else " No Home Mini, so no live view."))
        actions = [] if st == "ready" else ["Readings have gaps or are stale: check the meter is sending data"]
    return {"status": st, "mode": mode, "granularity": gran, "coverage_pct": worst["coverage_pct"],
            "latest_reading_end": worst["latest_reading_end"], "data_age_hours": age, "live": live,
            "message": msg, "actions": actions, "meter_points": pts}


def rates_to_periods(rates: list[dict], day_start: datetime, day_end: datetime, tz) -> list[dict]:
    """Octopus unit-rate records -> time-of-day windows for one local day (approximate on clock-change days)."""
    s_utc, e_utc = day_start.astimezone(timezone.utc), day_end.astimezone(timezone.utc)
    segs = []
    for r in rates:
        a = max(parse_dt(r["valid_from"]), s_utc)
        b = min(parse_dt(r.get("valid_to")) or e_utc, e_utc)
        if a < b:
            segs.append([(a - s_utc).total_seconds() / 60, (b - s_utc).total_seconds() / 60, r["value_inc_vat"]])
    segs.sort()
    merged: list[list] = []
    for a, b, v in segs:
        if merged and abs(merged[-1][2] - v) < 1e-9 and abs(merged[-1][1] - a) < 1e-6:
            merged[-1][1] = b
        else:
            merged.append([a, b, v])
    f = lambda m: "24:00" if m >= 1440 else f"{m // 60:02d}:{m % 60:02d}"
    out = []
    for a, b, v in merged:
        a, b = int(round(a)), min(1440, int(round(b)))
        if b > a:
            out.append({"name": "All day" if (a, b) == (0, 1440) else f"{f(a)}\u2013{f(b)}",
                        "start": f(a), "end": f(b), "p_per_kwh": round(v, 4)})
    return out
