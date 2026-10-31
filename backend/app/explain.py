"""'Explain yesterday': compares one day's half-hourly usage with the customer's own recent pattern,
adds weather, and produces findings where EVERY statement carries an evidence label:

  measured   straight from the meter data
  estimated  derived with a model (e.g. weather regression); can be wrong
  guess      a plausible cause; the data cannot confirm it

The whole-property meter cannot identify appliances, so appliance names only ever appear as 'guess'.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Callable
from zoneinfo import ZoneInfo

HDD_BASE_C = 15.5          # degrees below which heating is assumed to start
MIN_WEATHER_DAYS = 14      # fewer baseline days than this: never blame the weather
MIN_R2 = 0.3
EXCESS_MIN_KWH = 0.4       # an hour must exceed its usual level by at least this ...
EXCESS_SIGMAS = 2.0        # ... and by this many standard deviations


def ols(xs: list[float], ys: list[float]):
    """Least-squares line y = a + b*x. Returns (slope, intercept, r2) or None if x doesn't vary."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if n < 3 or sxx < 1e-9:
        return None
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    return b, a, (1 - ss_res / ss_tot) if ss_tot > 1e-9 else 0.0


def match_appliances(avg_kw: float, appliances: list[dict], tol: float = 0.25) -> list[str]:
    """Which declared appliances (alone or in pairs) draw roughly `avg_kw`? Rated-power matching: a guess."""
    hits = [f"{a['name']} ({a['power_kw']} kW)" for a in appliances if abs(a["power_kw"] - avg_kw) <= tol * avg_kw]
    for i, a in enumerate(appliances):
        for b in appliances[i + 1:]:
            if abs(a["power_kw"] + b["power_kw"] - avg_kw) <= tol * avg_kw:
                hits.append(f"{a['name']} + {b['name']} ({a['power_kw'] + b['power_kw']:.2f} kW)")
    return hits[:3]


def _action(text, effort, risk, undo):
    return {"text": text, "effort": effort, "risk": risk, "undo": undo}


def build_explanation(
    *, target: date, tz: ZoneInfo, intervals: dict[datetime, float],
    rate_p: Callable[[datetime], float | None], standing_p_per_day: float | None,
    temps: dict[str, list[float | None]] | None, weather_note: str | None,
    appliances: list[dict] | None = None,
) -> dict:
    """Pure function: all I/O is done by the caller. `intervals` maps UTC interval starts to kWh."""
    appliances = appliances or []
    by_day: dict[date, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    n_by_day: dict[date, int] = defaultdict(int)
    cost_by_day: dict[date, float] = defaultdict(float)
    unpriced = 0
    for t, kwh in intervals.items():
        loc = t.astimezone(tz)
        by_day[loc.date()][loc.hour] += kwh
        n_by_day[loc.date()] += 1
        r = rate_p(t)
        if r is None:
            unpriced += 1
        else:
            cost_by_day[loc.date()] += kwh * r

    if n_by_day.get(target, 0) < 40:
        return {"status": "insufficient_data", "date": target.isoformat(),
                "message": f"Only {n_by_day.get(target, 0)} of 48 half-hourly readings exist for {target}. "
                           "Not enough to explain the day.",
                "findings": [], "data_quality": {"intervals": n_by_day.get(target, 0), "expected": 48}}

    full = [d for d in by_day if d < target and n_by_day[d] >= 44]
    weekend = target.weekday() >= 5
    same = [d for d in full if (d.weekday() >= 5) == weekend]
    base_days = same if len(same) >= 4 else full
    if len(base_days) < 3:
        return {"status": "insufficient_data", "date": target.isoformat(),
                "message": f"Only {len(base_days)} comparable earlier days found. Need at least 3 to know what is normal.",
                "findings": [], "data_quality": {"intervals": n_by_day[target], "expected": 48}}

    day_kwh = {d: sum(by_day[d].values()) for d in by_day}
    t_kwh = day_kwh[target]
    base_kwh = statistics.mean(day_kwh[d] for d in base_days)
    base_h = [statistics.mean(by_day[d].get(h, 0) for d in base_days) for h in range(24)]
    sd_h = [max(0.1, statistics.pstdev([by_day[d].get(h, 0) for d in base_days])) for h in range(24)]
    t_h = [by_day[target].get(h, 0) for h in range(24)]
    excess = [t_h[h] - base_h[h] for h in range(24)]

    energy_p = cost_by_day[target]
    standing_p = standing_p_per_day or 0.0
    cost = (energy_p + standing_p) / 100
    avg_rate = energy_p / t_kwh if t_kwh else 0.0           # p/kWh actually paid yesterday
    base_cost = statistics.mean(day_kwh[d] for d in base_days) * avg_rate / 100 + standing_p / 100
    delta, delta_pct = t_kwh - base_kwh, (t_kwh - base_kwh) / base_kwh * 100 if base_kwh else 0.0

    # --- weather: does this customer's usage follow the temperature?
    wx: dict = {"available": False, "reason": weather_note or "No weather data."}
    explained = 0.0
    if temps:
        def mean_t(d: date):
            v = [x for x in temps.get(d.isoformat(), []) if x is not None]
            return statistics.mean(v) if len(v) >= 20 else None
        mt_target = mean_t(target)
        pts = [(max(0.0, HDD_BASE_C - mt), day_kwh[d]) for d in base_days if (mt := mean_t(d)) is not None]
        mts = [mean_t(d) for d in base_days if mean_t(d) is not None]
        if mt_target is None:
            wx["reason"] = "No temperature data for that day."
        else:
            hdd_t = max(0.0, HDD_BASE_C - mt_target)
            wx = {"available": True, "mean_temp_c": round(mt_target, 1),
                  "baseline_mean_temp_c": round(statistics.mean(mts), 1) if mts else None,
                  "heating_degree_days": round(hdd_t, 1), "n_days": len(pts), "usable": False}
            fit = ols([p[0] for p in pts], [p[1] for p in pts]) if len(pts) >= MIN_WEATHER_DAYS else None
            if fit is None:
                wx["reason"] = (f"Only {len(pts)} days of history; need {MIN_WEATHER_DAYS}+ with varied temperatures "
                                "before weather can be linked to usage.")
            else:
                slope, _, r2 = fit
                wx.update({"slope_kwh_per_degree_day": round(slope, 2), "r2": round(r2, 2)})
                if r2 < MIN_R2 or slope <= 0:
                    wx["reason"] = "Across the last weeks, usage does not follow temperature closely, so the weather isn’t blamed."
                else:
                    exp = slope * (hdd_t - statistics.mean(p[0] for p in pts))
                    explained = max(min(exp, delta), 0.0) if delta > 0 else min(max(exp, delta), 0.0)
                    wx.update({"usable": True, "explained_delta_kwh": round(explained, 2), "reason": None})
    # --- windows where the day exceeded its usual pattern AFTER allowing for the weather's estimated share
    #     (the weather share is spread over the day in proportion to normal usage, a simplification)
    tot_base = sum(base_h) or 1.0
    wshare = [explained * base_h[h] / tot_base for h in range(24)]
    resid_h = [excess[h] - wshare[h] for h in range(24)]
    hot = [h for h in range(24) if resid_h[h] >= EXCESS_MIN_KWH and resid_h[h] > EXCESS_SIGMAS * sd_h[h]]
    windows, run = [], []
    for h in hot + [99]:
        if run and h != run[-1] + 1:
            ex = sum(resid_h[x] for x in run)
            windows.append({"start": f"{run[0]:02d}:00", "end": f"{run[-1] + 1:02d}:00", "excess_kwh": round(ex, 2),
                            "avg_excess_kw": round(ex / len(run), 2), "extra_cost_gbp": round(ex * avg_rate / 100, 2),
                            "overnight": all(x < 6 or x >= 22 for x in run)})
            run = []
        if h != 99:
            run.append(h)

    residual = delta - explained

    # --- findings, every one labelled
    F: list[dict] = []
    word = "more" if delta >= 0 else "less"
    F.append({"evidence": "measured", "title": f"Yesterday: {t_kwh:.1f} kWh, £{cost:.2f}",
              "detail": f"That is {abs(delta):.1f} kWh ({abs(delta_pct):.0f}%) {word} than a typical "
                        f"{'weekend' if weekend else 'weekday'} (£{cost - base_cost:+.2f} versus normal).", "actions": []})
    if wx.get("usable") and abs(explained) >= 0.5:
        d_t = wx["mean_temp_c"] - (wx["baseline_mean_temp_c"] or wx["mean_temp_c"])
        F.append({"evidence": "estimated", "title": f"Weather explains about {abs(explained):.1f} kWh",
                  "detail": f"It was {abs(d_t):.1f}°C {'colder' if d_t < 0 else 'warmer'} than usual. Your usage has moved by "
                            f"about {wx['slope_kwh_per_degree_day']} kWh per extra degree-day over {wx['n_days']} days "
                            f"(fit quality r²={wx['r2']}). This is an estimate.", "actions": []})
    elif wx.get("available") and wx.get("reason"):
        F.append({"evidence": "measured", "title": "Weather can’t be linked to your usage yet", "detail": wx["reason"], "actions": []})
    elif not wx.get("available"):
        F.append({"evidence": "measured", "title": "No weather comparison", "detail": wx["reason"], "actions": []})

    for w in windows:
        kw = w["avg_excess_kw"]
        desc = (f"Between {w['start']} and {w['end']} the property used {w['excess_kwh']} kWh more than usual "
                f"(about {kw} kW extra, £{w['extra_cost_gbp']:.2f})" + (", after allowing for the weather." if wx.get("usable") else "."))
        if w["overnight"]:
            guess = ["fridges or freezers working harder", "extraction or ventilation left on", "hot water or heating on a timer",
                     "equipment left on instead of standby"]
            acts = [_action(f"Check what is running between {w['start']} and {w['end']}.", "Low", "None", "Nothing to undo."),
                    _action("Switch off non-essential equipment at closing for a week, then compare.", "Low", "Low",
                            "Switch it back on; note what you changed so it’s one step to revert.")]
        else:
            guess = ["cooking or heating peak", "extra customers or occupancy", "equipment run longer than usual"]
            acts = [_action(f"Compare {w['start']}–{w['end']} with what happened that day (opening hours, events).", "Low", "None",
                            "Nothing to undo.")]
        F.append({"evidence": "measured", "title": f"Unusual use {w['start']}–{w['end']}", "detail": desc, "actions": []})
        match = match_appliances(kw, appliances)
        F.append({"evidence": "guess", "title": "Possible causes (not confirmed)",
                  "detail": ("Consistent with your declared appliances: " + "; ".join(match) + ". " if match else "")
                            + "Common causes at this time: " + ", ".join(guess) + ". The whole-property meter can’t tell which.",
                  "actions": acts})
    if not windows and abs(delta_pct) < 8:
        F.append({"evidence": "measured", "title": "A normal day", "detail": "No hour stood out from your usual pattern.", "actions": []})
    elif not windows:
        F.append({"evidence": "measured", "title": "Spread across the day",
                  "detail": "The difference isn’t concentrated in any one window, which usually points to weather or occupancy, not a fault.",
                  "actions": []})
    F.append({"evidence": "measured", "title": "What this data can’t tell you",
              "detail": "Which individual appliance used the energy. To measure that, add plug-in meters or connect device integrations "
                        "(EV charger, heat pump, inverter).", "actions": []})
    quiet = min(range(24), key=lambda h: t_h[h])
    return {
        "status": "ok", "date": target.isoformat(), "day_type": "weekend" if weekend else "weekday",
        "totals": {"kwh": round(t_kwh, 2), "cost_gbp": round(cost, 2), "baseline_kwh": round(base_kwh, 2),
                   "baseline_cost_gbp": round(base_cost, 2), "delta_kwh": round(delta, 2), "delta_pct": round(delta_pct, 1),
                   "unexplained_kwh": round(residual, 2), "quietest_hour": f"{quiet:02d}:00", "quietest_hour_kwh": round(t_h[quiet], 3)},
        "hourly": [{"hour": h, "kwh": round(t_h[h], 3), "baseline_kwh": round(base_h[h], 3), "excess_kwh": round(excess[h], 3),
                    "unexplained_kwh": round(resid_h[h], 3)} for h in range(24)],
        "weather": wx, "windows": windows, "findings": F,
        "data_quality": {"intervals": n_by_day[target], "expected": 48, "baseline_days": len(base_days), "unpriced_intervals": unpriced},
    }


AGENT_RULES = (
    "You explain one day of electricity use to a UK small-business owner. Use ONLY the JSON below. "
    "Keep each finding's evidence label (measured / estimated / guess) visible in your wording, e.g. 'measured:', 'estimate:', 'possible cause:'. "
    "Never name a specific appliance as the cause unless the data says it was measured; say 'something drew X kW' instead. "
    "For each action give effort, risk and how to undo it. If status is not 'ok', say what is missing and stop. "
    "Be concrete with £ and kWh, under 200 words, plain text."
)


def agent_prompt(explanation: dict, question: str = "Explain yesterday and tell me what to do.") -> str:
    import json
    return f"{AGENT_RULES}\n\nDATA:\n{json.dumps(explanation)}\n\nQUESTION: {question}"
