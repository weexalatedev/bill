# Settings → connector wiring

How the app implements `docs/DEVICE_CONNECTOR_BRIEF.md` (the client brief that shipped in
`eneros-handover (1).zip`). The Python service in `backend/` is the contract; the screens
follow it, not the other way round.

## Where the pieces live

| Brief section | Implementation |
| --- | --- |
| 2. Ground rules — browser never calls the connector | `server/src/routes/connector.ts` proxies `/api/connector/*` and adds `APP_API_TOKEN`; it never logs bodies |
| 3. Setup | `backend/` as shipped (unchanged apart from the two hardening fixes below) |
| 4. Devices tab | `src/components/settings/DevicesTab.tsx` — `GET /devices`, `POST /devices/refresh`, connect/remove for Octopus and Solis, readiness + rate-plan sync straight after an Octopus connect, pill mapping |
| 4. Pause sub-tab | `src/components/settings/PauseTab.tsx` — `PUT /settings/pause`, shows `effective.sync_active` and `effective.alerts_controls_active` |
| 4. Rate Plan tab | `src/components/settings/RatePlanTab.tsx` — `GET /settings`, `PUT /settings/rate-plan`, `POST /homes/{id}/rate-plan/sync-from-octopus`, 422 messages shown inline, `import_coverage_pct` bar |
| 4. Hardware tab | `src/components/settings/HardwareTab.tsx` — `PUT /settings/hardware`; the battery total is whatever the backend returns |
| 4. Smart Control tab | `src/components/settings/SmartControlTab.tsx` — read-only, existing behaviour preserved |
| 5–7. Dashboard, readiness, yesterday explainer, AI prompt | `src/components/settings/DeviceDataTab.tsx` — `/readiness` gate, `/dashboard` totals + hourly profile, `/live` when a Home Mini exists, `/yesterday` findings with their measured / estimate / possible-cause labels, and the ready-made `agent_prompt` |
| 8. Error handling | `errorGuidance()` in `src/lib/connector.ts` maps 401 / 404 / 422 / 423 / 429 / 502 to the wording the brief asks for |
| 9. Polling | Data loads on demand plus a Refresh button; `/devices/refresh` is only ever called by that button (initial load uses the cheap `/devices`) |

Screens live at `/settings` (tabs: Devices, Rate Plan, Smart Control, Hardware, Pause
Connections, Live data). The selected site's id is the connector's `home_id`.

## Two fixes to the shipped backend

1. `app/octopus.py` and `app/providers/solis.py` only mapped HTTP responses to
   `ProviderError`. A DNS/TLS/connection failure escaped as an unhandled `httpx`
   exception and produced **HTTP 500 with a traceback**, so the app could not show the
   brief's "provider returned an error" state. Transport errors and non-JSON bodies now
   raise `ProviderError` (502) with a readable message. Regression tests:
   `test_unreachable_provider_is_502_not_500`, `test_unreachable_soliscloud_is_502_not_500`.
2. The shipped `src/lib/multiApi.ts` client used the wrong verbs and paths (`POST` for
   settings, `/v1/solis/{id}/...`, `/v1/rate-plan/sync-from-octopus`) and was imported by
   nothing. It is replaced by `src/lib/connector.ts`, which mirrors `backend/app/*.py`.

## Running the checks

```bash
# 1. connector backend
cd backend && pip install -r requirements.txt
ENCRYPTION_KEY=... APP_API_TOKEN=dev-token-123 DATABASE_PATH=eneros.db \
  uvicorn app.main:app --host 127.0.0.1 --port 8000
pytest -q                       # 39 tests

# 2. Node API (proxies /api/connector) — APP_API_TOKEN must match
cd server && APP_API_TOKEN=dev-token-123 PYTHON_BACKEND_URL=http://127.0.0.1:8000 npm run dev:memory

# 3. web app
npm install && npm run dev      # /settings

# 4. end-to-end contract check through the proxy (no provider keys needed)
npm run verify:connector
# add VERIFY_HOME_ID + VERIFY_CONNECTION_ID to include the 423 pause gate
```

`npm run verify:connector` uses the same `src/lib/connector.ts` the UI uses, so a green
run means the screens' calls and the backend agree.
