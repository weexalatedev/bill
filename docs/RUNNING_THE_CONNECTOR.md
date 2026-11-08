# Running the Python connector (FastAPI)

> Three processes make up EnerOS: **web** (Next.js :3000), **API** (Express :4000) and the
> **connector** (FastAPI :8000). The connector owns supplier credentials and talks to
> Octopus and Solis; the browser never calls it directly — every call goes through the Node
> API at `/api/connector/*`, which adds the server-side bearer token.
>
> Everything below is read from the scripts in this repo (`scripts/setup.mjs`,
> `scripts/dev-backend.mjs`, `backend/app/config.py`), not from memory.

## 1. Prerequisites

| Need | Version | Why |
| --- | --- | --- |
| Node | ≥ 20.9 | web + API + the dev launcher |
| Python | ≥ 3.10 (3.11/3.12 have the widest wheel coverage) | the connector |
| Network | needs access to PyPI **once** | `pip install -r backend/requirements.txt` |

## 2. One command that does it all

```bash
npm run setup
```

It performs four steps, in order:

1. `npm install` at the root and in `server/`;
2. writes `.env` from `.env.example` **with a generated Fernet key**;
3. creates `backend/.venv` with your system Python;
4. `backend/.venv/bin/python -m pip install -r backend/requirements.txt`
   (`fastapi`, `uvicorn`, `httpx`, `cryptography`, `python-dotenv`, `pytest`).

If it stops at step 4, the connector cannot run: the reason is a package-index problem, not
the app. See §6.

## 3. Start the stack

```bash
npm run dev:all          # web :3000 · API :4000 · connector :8000, labelled output
```

Separate terminals, if you prefer:

```bash
npm run dev:web          # Next.js
npm run dev:api          # API with an in-memory MongoDB
npm run dev:backend      # uvicorn, loading the repo-root .env
```

`dev:backend` deliberately fails early with a readable message if `APP_API_TOKEN` or
`ENCRYPTION_KEY` is missing, and warns if `backend/.venv` is absent (falling back to
`python3` on `PATH`).

## 4. Prove it is working

```bash
npm run doctor           # every prerequisite, with the fix for each failure
npm run verify:connector # the Settings contract, through the Node proxy
```

`doctor` checks Node, `.env`, the Fernet key shape, the virtualenv, the Python imports, the
connector's `/openapi.json`, **whether the connector accepts your `APP_API_TOKEN`**, and the
Node API's `/api/health`. It exits non-zero only on blocking problems; add `-- --strict` to
also fail when a service is simply not running.

You can also open **http://127.0.0.1:8000/docs** — FastAPI's generated reference for every
connector endpoint.

## 5. Configuration

The **root `.env` is the single source of truth** — web, API and connector all read it, so
the token cannot drift between them.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `APP_API_TOKEN` | API + connector | Shared bearer token. The API adds it when proxying; the connector rejects anything else with **401** |
| `ENCRYPTION_KEY` | connector | Fernet key (44-char url-safe base64 = 32 bytes). Encrypts supplier keys at rest in SQLite |
| `PYTHON_BACKEND_URL` | API | Where the proxy forwards (`http://127.0.0.1:8000`) |
| `DATABASE_PATH` | connector | SQLite file, **relative to `backend/`** (`eneros.db`) |
| `BACKEND_PORT` / `PYTHON_BACKEND_PORT` | `dev:backend` | Override the listen port (then update `PYTHON_BACKEND_URL`) |
| `PYTHON_BIN` | `dev:backend` | Force a specific interpreter instead of `backend/.venv` |
| `OCTOPUS_*`, `OPEN_METEO_API_KEY` | connector | Provider endpoints / an optional weather key |

Generate a replacement key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

> **Rotating `ENCRYPTION_KEY` makes stored supplier keys unreadable.** The connector will raise
> `InvalidToken` on the next provider call. Existing connections must be removed and
> reconnected (or the previous key restored). A re-encrypt script is Phase 4 work.

## 6. Troubleshooting — symptom → cause → fix

| What you see | Cause | Fix |
| --- | --- | --- |
| Devices tab: **“The device service is not reachable”** | nothing listening on :8000, or `PYTHON_BACKEND_URL` points elsewhere | `npm run dev:backend` (or `dev:all`); confirm `curl http://127.0.0.1:8000/openapi.json` |
| Connector log: `RuntimeError: ENCRYPTION_KEY and APP_API_TOKEN must be set` | `backend/.env` and the root `.env` are both missing or empty | `npm run setup`, then start via `npm run dev:all` (it loads the root `.env`) |
| Any provider call returns **401** | the API and the connector hold different `APP_API_TOKEN` | restart both from the same shell so they read the same root `.env`; `npm run doctor` names this case |
| Provider call returns **423 Locked** | *Pause connections* is on for that home (`home_connections` or `device_sync`) | Settings → Pause Connections; the UI shows “Paused” and deliberately does not retry |
| `cryptography.fernet.InvalidToken` | `ENCRYPTION_KEY` changed after keys were stored | restore the old key, or remove + reconnect the device |
| `pip install` fails: `No matching distribution found for fastapi` | no route to PyPI (corporate proxy, offline machine, restricted sandbox) | set `PIP_INDEX_URL` / use an internal mirror, or install from a wheelhouse: `backend/.venv/bin/python -m pip install --no-index --find-links=/path/to/wheels -r backend/requirements.txt` |
| `pip install` fails building `cryptography` | no compiler and no wheel for your Python version | use Python 3.11/3.12, or install the OS build tools (`build-essential libssl-dev` / Xcode CLT) |
| `address already in use` on 8000 | another process holds the port | `BACKEND_PORT=8010 npm run dev:backend` **and** set `PYTHON_BACKEND_URL=http://127.0.0.1:8010` |
| Windows: `backend/.venv` not found | venv layout is `Scripts\python.exe` | run `npm run setup` (it picks the right path per platform); don’t hand-build a venv with a different name |
| Device connected but no data | provider-side: meter not half-hourly, key lacks permission, or the home has no readings yet | Settings → Devices → **Refresh**; `GET /v1/connections/{id}/readiness` explains what is missing |

## 7. What works without the connector

The web app and the API are complete without it: the bill check, the audit engine, sites,
invoices, meter-data import, live market and the Copilot all run. Only the **Devices** tab and
the connector-backed Settings tabs (Rate plan, Hardware, Smart control, Pause, Live data)
need it — and they degrade to an explicit offline state rather than pretending a device is
connected.

## 8. What is *not* covered here

- **No sandbox credentials.** Octopus needs a real API key + account number; Solis needs an
  API id/secret. The connector validates them against the provider at connect time.
- **No billing-grade metering.** Connector readings are for insight, not for invoicing.
- **Unverified in this environment.** On the machine this document was written, PyPI is
  unreachable, so `backend/.venv` could not be created and the connector's own pytest suite
  could not run. `npm run doctor` reports exactly that instead of claiming a pass. Run
  `cd backend && .venv/bin/python -m pytest` where PyPI is reachable to close it.
