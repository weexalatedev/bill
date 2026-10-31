# EnerOS · Octopus Energy connector

FastAPI backend behind the "Connect Octopus Energy" modal (API key + account number).

## Run
    pip install -r requirements.txt
    cp .env.example .env   # fill ENCRYPTION_KEY and APP_API_TOKEN, then: export $(grep -v '^#' .env | xargs)
    uvicorn app.main:app --reload
    pytest            # runs against mocked Octopus responses

## Endpoints (all need `Authorization: Bearer $APP_API_TOKEN`)
| Method | Path | Purpose |
|---|---|---|
| POST | /v1/connections | "Connect Device": validates against Octopus, stores key encrypted |
| DELETE | /v1/connections/{id} | Disconnect + delete stored data |
| GET | /v1/connections/{id}/account | Normalised properties, meters, tariff agreements |
| GET | /v1/connections/{id}/raw/account | Octopus's untouched JSON |
| GET | /v1/connections/{id}/consumption | Half-hourly or grouped usage (`days`, `group_by`, `fuel`) |
| GET | /v1/connections/{id}/tariffs | Active tariff, current unit rate, standing charge, upcoming rates |
| GET | /v1/connections/{id}/dashboard | Totals, cost, daily series, hourly profile, peak, baseload, anomalies |
| GET | /v1/connections/{id}/readiness | Run right after connect: half-hourly or not, data age, Home Mini (live) available? |
| GET | /v1/connections/{id}/yesterday | Explain a day (default yesterday): vs usual pattern, weather, unusual windows, findings labelled measured/estimated/guess. `?date=`, `?location=`, `?include_prompt=true` |
| GET | /v1/connections/{id}/live | Near-real-time demand (needs Home Mini) |
| POST | /v1/connections/{id}/sync | Store half-hourly data in your own DB |
| GET | /v1/connections/{id}/readings | Read stored history |

## Home settings, devices and pause switches — `/v1/homes/{home_id}/...`
`home_id` is YOUR app's id for the home. Pass it as `home_id` when connecting a device to link them.
| Method | Path | Purpose |
|---|---|---|
| GET | /settings | Hardware, rate plan and pause state in one call |
| PUT | /settings/hardware | Timezone, site, solar setup, kWp, battery units and capacity (total is computed) |
| PUT | /settings/rate-plan | Supplier, standing charge p/day, import periods (validated: no overlaps), export p/kWh |
| PUT | /settings/appliances | Appliances the customer says they own (name, rated kW). Used only for 'consistent with…' guesses |
| PUT | /settings/pause | home_connections, device_sync, alerts_controls (returns the effective state) |
| POST | /rate-plan/sync-from-octopus?connection_id= | Fill the rate plan from the connected Octopus account |
| GET | /devices | Connected devices for this home (no upstream calls) |
| POST | /devices/refresh | Probe each device: connected, reconnect_required, paused or error |

While a home has device sync (or home connections) paused, every provider data call for its connections answers **423 Locked**.

## Solis (SolisCloud) — `/v1/solis/...`
| Method | Path | Purpose |
|---|---|---|
| POST | /v1/solis/connections | `{api_id, api_secret}`: signed test call, then stored encrypted |
| DELETE | /v1/solis/connections/{id} | Disconnect |
| GET | …/stations, …/stations/{id} | Plants (sites) |
| GET | …/inverters, …/inverters/{sn} | Inverter list; detail with normalised power/energy |
| GET | …/inverters/{sn}/day?date=YYYY-MM-DD | Intra-day generation curve |
| GET | …/dashboard | Fleet totals: live kW, energy today/total, state counts |

Solis notes: credentials come from SolisCloud > Account > Basic Settings > API Management; all calls are signed
POSTs; the server clock must be within 15 min of real time; data refreshes about every 5 min. Field names beyond
`pac/eToday/eTotal` were not verified against a live account: `missing_fields` in each summary flags any gap.

## Adding the next provider
Create `app/providers/<name>.py` with a `router`, store credentials via `providers/store.py`, raise
`ProviderError` subclasses, then `app.include_router(...)` in main.py. Copy `tests/test_solis.py` as a template.

## Delayed vs live
- Everything except `/live` is **delayed**: Octopus's usage API is about a day behind, so the dashboard ends at the last full day.
- `/live` is **near-live** but only with an Octopus Home Mini, and it is not part of the dashboard maths.
- `/readiness` tells your UI which of these the customer has (`mode`: none, daily_only, half_hourly_delayed, half_hourly_delayed_plus_live).

## Verify on real data (do this first)
    uvicorn app.main:app &                       # with ENCRYPTION_KEY and APP_API_TOKEN set
    python scripts/smoke_test.py --base-url http://localhost:8000 --token $APP_API_TOKEN --location Manchester \
        [--solis-id ... --solis-secret ...]      # key + account prompted, never put in shell history
It runs 12 checks (connect, account, readiness, dashboard, tariffs, yesterday + weather, rate-plan sync, devices, pause/resume,
live, Solis, cleanup) and prints PASS / FAIL / SKIP with the real numbers so you can sanity-check them against the Octopus app.
The script itself is tested against mocks (`pytest`), so a FAIL means the real service differs from the documented behaviour.

## Weather licence
Weather comes from Open-Meteo. Its free API is **non-commercial only**: for a commercial product buy a key and set `OPEN_METEO_API_KEY`.

## Known limits
- Not tested against a live account (no network in the build sandbox). Verify with your own key first.
- Cost estimates support single-rate (1R) tariffs. Economy 7 / multi-rate (2R) is flagged, not priced.
- SMETS2 gas reports m3; pass `gas_unit=m3` to convert (approx. 11.22 kWh/m3).
- Consumption lags roughly a day; the dashboard ends at the last complete day.
- Replace the single bearer token with real user auth before production. Use Postgres instead of SQLite at scale.
