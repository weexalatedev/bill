# EnerOS connector backend: integration brief

You are integrating a ready-made backend into an existing energy app (the "client app"). The client app already has its own Settings screens (Devices, Rate Plan, Smart Control, Hardware, Pause Connections) and its own dashboard. **Do not rebuild those screens.** This backend supplies the data and the connections behind them. Wire the existing screens to it as described below.

Folder contents:
- `backend/` — FastAPI service (Python 3.11+). 26 automated tests, run with `pytest`.
- `reference-ui/octopus-connect-demo.html` — a clickable mock of the screens, showing exactly which backend call each button makes. Open it in a browser. All its data is simulated.

## 1. What the backend does

It connects to energy providers on behalf of each home, stores the customer's credentials encrypted, and returns clean JSON. It also stores per-home settings and enforces the Pause switches.

| Provider | What the customer pastes | Status |
|---|---|---|
| Octopus Energy | API key + account number (`A-XXXXXXXX`) | Built |
| Solis Inverter | API ID + API Secret | Built |
| Axle, Daikin, myenergi Eddi, Ohme | — | **Not built yet** (the client app should keep showing these as before) |

## 2. Ground rules

1. **Browser never calls this backend directly.** The client app's server calls it with the header `Authorization: Bearer <APP_API_TOKEN>`. The token and all provider keys stay server-side.
2. `home_id` is the client app's own id for a home. Send it on every connect call. The backend never creates homes.
3. Never log request bodies on connect calls. They contain API keys and secrets.
4. Treat all JSON as the contract. Field meanings are listed in section 5.

## 3. Setup

```
cd backend
pip install -r requirements.txt
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # -> ENCRYPTION_KEY
export ENCRYPTION_KEY=...  APP_API_TOKEN=...  DATABASE_PATH=eneros.db
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Interactive API docs appear at `/docs`. Run behind HTTPS. Back up `ENCRYPTION_KEY`: losing it makes every stored credential unreadable. For production replace SQLite with Postgres (the SQL is simple and lives in `app/db.py`, `app/homes.py`, `app/providers/store.py`).

## 4. Screen-by-screen wiring

### Devices tab
| UI element | Backend call |
|---|---|
| List of devices and their pills | `GET /v1/homes/{home_id}/devices` (cheap, no provider calls) |
| **Refresh status** button | `POST /v1/homes/{home_id}/devices/refresh` |
| Octopus "Connect" modal, **Connect Device** | `POST /v1/connections` with `{api_key, account_number, home_id}` |
| Solis "Connect" modal | `POST /v1/solis/connections` with `{api_id, api_secret, home_id}` |
| **Remove** | `DELETE /v1/connections/{id}` (Octopus) or `DELETE /v1/solis/connections/{id}` (Solis). This also works while paused. |

Pill mapping from `/devices/refresh` → `status`:
- `connected` → "Connected · live"
- `reconnect_required` → "Disconnected · reconnect required" (customer regenerated or revoked the key)
- `paused` → "Paused"
- `error` → show `message`
- device absent from the list → "Not connected · connect when ready"

After a successful Octopus connect, immediately call `GET /v1/connections/{id}/readiness` (section 6) and `POST /v1/homes/{home_id}/rate-plan/sync-from-octopus?connection_id={id}`.

### Pause Connections sub-tab
`PUT /v1/homes/{home_id}/settings/pause` with `{home_connections, device_sync, alerts_controls}`. The response has `effective.sync_active` and `effective.alerts_controls_active`. Show the two cards from `effective`, not from the raw flags: turning **Home connections** off pauses both.
When sync is paused, every data call for that home's connections returns **HTTP 423**. Show "Paused", do not retry. Alerts and controls are enforced by the client app using `effective.alerts_controls_active`; the backend only stores the flag.

### Rate Plan tab
- Load: `GET /v1/homes/{home_id}/settings` → `rate_plan`.
- Save: `PUT /v1/homes/{home_id}/settings/rate-plan` with `{supplier, standing_charge_p_per_day, import_rates:[{name,start,end,p_per_kwh}], export_rate_p_per_kwh, source}`. Times are `HH:MM` in the home's timezone, `24:00` means end of day. The backend rejects overlapping periods with 422; show its message. `import_coverage_pct` tells you how much of the day is priced (the all-day bar).
- Octopus auto-fill: `POST …/rate-plan/sync-from-octopus` sets supplier, standing charge and import periods and returns `source:"octopus"`. Dynamic tariffs (Agile) change daily, so schedule this once a day. Multi-rate tariffs (Economy 7) return 422: let the customer enter rates manually. Export rate is never overwritten.

### Hardware tab
- Home sub-tab (timezone, site location, solar setup, solar panel size) and Battery sub-tab (units, capacity per battery, total) → `PUT /v1/homes/{home_id}/settings/hardware`. `battery_total_kwh` is computed by the backend.
- Battery data is manual (`battery_source:"manual"`). Reading pack size from the Solis inverter is **not built**, because the exact Solis field names were not verifiable without a live account.

### Smart Control tab
Not covered by this backend yet. Keep the client app's existing behaviour.

## 5. Data for dashboards and the AI agent

All paths below are `GET /v1/connections/{id}/...` (Octopus). Responses are JSON.

| Path | What it returns | Freshness |
|---|---|---|
| `/readiness` | `status` (ready, limited, no_data), `mode`, `granularity`, `data_age_hours`, `live.available`, `message`, `actions[]` | now |
| `/dashboard?days=30` | totals, cost, `daily[]`, `hourly_profile_kwh[24]`, `peak_half_hour`, `baseload_kw`, `anomalous_days[]` | about 1 day behind |
| `/consumption?fuel=&days=&group_by=` | raw half-hourly or grouped usage | about 1 day behind |
| `/tariffs` | active tariff, current unit rate p/kWh, standing charge, upcoming rates | now |
| `/account`, `/raw/account` | properties, meter points, agreements (normalised / untouched) | now |
| `/yesterday` | explanation of one day (see section 7) | about 1 day behind |
| `/live` | near-live demand; `available:false` without an Octopus Home Mini | seconds to 30 s |

Solis: `GET /v1/solis/connections/{id}/dashboard` returns live kW, energy today/total, and inverter state counts. Also `/stations`, `/inverters`, `/inverters/{sn}`, `/inverters/{sn}/day?date=`.

**Delayed versus live, stated plainly:** everything except `/live` is delayed by about a day. The dashboard ends at the last full day. Live data exists only for customers with a Home Mini and is not included in `/dashboard`.

## 6. Data readiness: required behaviour

Call `/readiness` after connecting and whenever the dashboard opens. Behave as follows:
- `ready` → show everything. If `live.available` is true, also show a live tile using `/live`.
- `limited` (`mode: daily_only`) → show only daily totals. Hide hourly profile, baseload and the AI advisor. Show `message` and `actions`.
- `no_data` → show only `message` and `actions`. New meters can take up to about two weeks to start sending readings.

## 7. Yesterday explainer and the AI agent

`GET /v1/connections/{id}/yesterday` (optional `date`, `location`, `include_prompt=true`) compares the day with the customer's own recent pattern (same weekday/weekend type), adds weather, and returns:
`totals` (kWh, £, versus normal), `hourly[]` (usage, usual, unexplained), `weather` (temperature, fitted kWh per degree-day, whether usable), `windows[]` (unusual periods after allowing for weather) and `findings[]`.
**Every finding carries an `evidence` label and your UI must show it:**
- `measured`: straight from the meter data;
- `estimated`: a model result (e.g. the weather share); can be wrong;
- `guess`: a plausible cause the data cannot confirm.
The whole-property meter cannot identify appliances, so appliance names appear only inside `guess` findings, and only matched against appliances the customer declared via `PUT /v1/homes/{home_id}/settings/appliances`.
Rules built in: weather is never blamed with fewer than 14 days of history or a weak fit (r² under 0.3); a day with fewer than 40 of 48 readings, or fewer than 3 comparable earlier days, returns `status: insufficient_data` and no advice.
Weather uses Open-Meteo and the home's `site_location` (Hardware tab). **Its free tier is non-commercial only: buy a key and set `OPEN_METEO_API_KEY` before launch.** If no location is set or the lookup fails, the endpoint still works and says why weather is missing.
Use `include_prompt=true` to get a ready-made instruction + data string to send to your LLM, or build your own.

### AI agent
Send the agent: `/yesterday`, `/dashboard`, `/readiness`, `GET /v1/homes/{home_id}/settings` (rate plan and hardware), and optionally the Solis dashboard. Instruct it to:

Send the agent: `/dashboard`, `/readiness`, `GET /v1/homes/{home_id}/settings` (rate plan and hardware), and optionally the Solis dashboard. Instruct it to:
- use only that data, state assumptions, give £ figures, and keep the measured / estimate / guess wording;
- for each recommendation say its effort, its risk and **how to undo it**;
- say so when an action would not pay (the demo shows a tariff switch that would raise the bill);
- never name an appliance as the cause unless it was measured;
- decline to give advice when `readiness.status` is not `ready`.
`reference-ui/octopus-connect-demo.html` contains a working example prompt under AI advisor → "Exactly what your agent receives".

## 8. Error handling

| HTTP | Meaning | What the client app does |
|---|---|---|
| 401 (from a provider route) | Provider rejected the credentials | Mark the device "reconnect required" and reopen the connect modal |
| 401 (no provider message) | Wrong or missing `APP_API_TOKEN` | Server-side configuration bug: alert the team |
| 404 | Unknown connection or no active tariff | Treat as not connected |
| 422 | Invalid input (bad account number, overlapping periods, unknown timezone) | Show the `error`/`detail` text next to the field |
| 423 | Home is paused | Show "Paused", do not retry |
| 429 | Provider rate limit | Back off and retry later |
| 502 | Provider returned an error | Show a retry option |

## 9. Polling guidance

- Octopus history changes about once a day: fetch `/dashboard` at most hourly and cache it.
- `/live`: at most every 30 seconds, and only while a live view is open.
- Solis refreshes about every 5 minutes.
- `/devices/refresh` only on the Refresh button or at most every few minutes. It makes real provider calls.
- Octopus and Solis rate limits are not published here: watch for 429.

## 10. Known limits: read before going live

1. **Not tested against live accounts.** The build environment could not reach Octopus, Solis or Open-Meteo. Tests use mocked responses that follow the providers' documented formats. **Run `backend/scripts/smoke_test.py` against one real Octopus account (and one Solis account) before launch**: it checks every endpoint and prints the real numbers to compare with the Octopus app. A FAIL there means the real service differs from the documentation.
2. Some Solis response field names beyond power, energy today and energy total are unverified. `missing_fields` in the Solis summaries flags any gap.
3. The readiness check infers "half-hourly or not" from interval lengths. How Octopus's API answers for a customer on daily reads has not been confirmed.
4. Cost estimates support single-rate tariffs only. Economy 7 is flagged, not priced.
5. The weather link is a statistical estimate from the customer's own history (heating degree-days), spread across the day in proportion to normal usage. It is not a physical model.
6. Octopus customers only. Commercial half-hourly meters may be governed by different data rules: confirm with Octopus before promising this to business customers.
7. Replace the single bearer token with proper per-user authorisation if the backend is ever exposed beyond the client app's servers.

## 11. Acceptance checklist

- [ ] `pytest` passes (37 tests)
- [ ] `scripts/smoke_test.py` shows no FAIL against a real account; the kWh and £ match the Octopus app within rounding
- [ ] Connect an Octopus account from the modal; device pill turns "Connected · live"
- [ ] Rate Plan fills from Octopus; editing an overlapping period shows a 422 message
- [ ] Hardware save returns the computed battery total
- [ ] Turning Device sync off makes dashboard calls return 423 and the pill read "Paused"; turning it on restores them
- [ ] Revoking the key in Octopus then pressing Refresh status shows "reconnect required"
- [ ] A customer with only daily readings sees the "limited" state and no AI advice
- [ ] `/yesterday` shows measured / estimate / guess labels, and never names an undeclared appliance
- [ ] With no site location, `/yesterday` still works and says weather is missing
- [ ] Connect a Solis account; dashboard shows live kW and energy today
- [ ] No API key or secret appears in any log
