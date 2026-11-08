# EnerOS — AI Energy Manager (billing & optimisation console)

**EnerOS** is a web + mobile console for *“the autonomous energy manager for Britain’s small and
medium businesses.”* It implements the product described in the business plan,
**[`business_plan.txt`](business_plan.txt)** — the main reference for what the
product is for and the order in which it gets built — with a
focus on the **energy billing** workflow: monitoring spend, auditing invoices, optimising energy
use and billing the customer.

A monorepo with three parts that share **one source of truth** (MongoDB) and **one set of
credentials**:

| Folder | App | Stack |
| --- | --- | --- |
| `/` (root) | Web console | Next.js 16 (App Router) + React 19 + Tailwind |
| `mobile/` | iOS / Android app | React Native (Expo) |
| `server/` | Shared API | Node + Express + MongoDB (Mongoose) |

Sign in with the **demo account** on web *and* mobile and you land on the exact same seeded
workspace — persisted in MongoDB, keyed by the authenticated user.

> The seeded dataset is deliberately *internally consistent* so the numbers reconcile: site
> spend sums to **£81,420**, expected spend to **£91,600**, therefore the dashboard reports
> **£10,180 saved** — exactly the plan’s example. It lives in MongoDB (not the bundle) and is
> written by `server/src/seed/seed.ts`.

## Design language

The interface is **monochrome** and set in the **system sans-serif** — no webfont request, so
nothing flashes or falls back to Arial on a slow connection. There is no accent colour: emphasis
is a ramp from black to near-white, and everything else is carried by weight, scale and hairline
rules.

| Token | Meaning |
| --- | --- |
| `solid` | ink fill, paper text — the loudest level (a headline figure, a high-severity finding) |
| `outline` | paper fill with an ink hairline — assertive but quiet |
| `muted` | grey fill, no border — secondary metadata |
| `ghost` | no fill, grey hairline — the quietest |

Semantic states map onto that ramp rather than onto hue: a *connected* device is `solid`, a
*disconnected* one is `outline`, a paused one is `muted`. The same applies to bill severity,
site status and plan emphasis.

Two files hold the whole system — `src/index.css` (palette, type scale, radii) and
`src/components/ui.tsx` (the tone ramp). Run **`npm run verify:theme`** after touching either: it
renders every primitive and the two most style-sensitive screens and fails if a chromatic class
or `font-mono` creeps back in.

## Feature overview (mapped to the plan)

| Page | Plan module | What it does |
| --- | --- | --- |
| **Get Started (flow)** | Acquisition wedge | **The front door.** `/start` is one continuous, screen-by-screen flow: **ask for a bill** (upload a PDF **or photo**, read with Gemini vision OCR when there is no text layer, or type the figures) → **your audit** (the deterministic engine prices the same usage at the UK reference rate and leads with *"you could save £X"*) → **create an account to save money**. No account needed until the visitor has seen the money. |
| **Free Bill Check** | Acquisition wedge | The same public check, also reachable directly. The engine is the paid product's engine, so the number is real, not a teaser — the plan's “free bill check without registration”. `/check` and `/get-started` now redirect into `/start`. |
| **Sign up / Login** | Layer 0 | Clerk-hosted auth at `/sign-up` and `/sign-in` when Clerk is configured; otherwise the API's own registration + login (dev auth) so the journey is real locally. A **new account always lands on the plan picker**, never the dashboard; sign-in resolves its destination from the subscription (`/auth/continue`). |
| **Subscription** | Layer 0 | `/onboarding/subscription` → `/onboarding/payment` → `/onboarding/payment-status`, and `/subscription` to manage afterwards. Plans come from one server catalogue (`server/src/services/plans.ts`); activation happens only after a **verified** payment. See [Subscriptions, plans and access](#subscriptions-plans-and-access). |
| **Onboarding** | Layer 0 | **Phase-wise, skippable screens** at `/onboarding`: site information → any further sites → devices (connect Octopus / a Solis inverter via the connector service) → done. Then the dashboard. The same prompts live on the dashboard as a setup checklist for anyone who skipped. |
| **Dashboard** – Energy Intelligence | Module A | Spend vs. expected baseline, verified savings, spend by asset and by site, latest AI findings, the baseline → intervention → outcome methodology, and a **Finish your setup** checklist until the workspace is complete. |
| **Smart Analysis** | Layer 2 – AI Energy Brain | The workbench. Enter a bill and the engine checks it against Ofgem's published price cap for the site's region, re-adds the invoice arithmetic, verifies VAT treatment, and compares consumption with the site's own baseline. Every finding carries its evidence, its £ impact and the licence condition to quote. |
| **Bill Auditor** | Module B | Upload/enter an invoice, run the audit, and review detected issues: *incorrect charge, abnormal consumption, tariff discrepancy, standing charge, meter issue, unexpected change*. Challenge a supplier to request recovery. |
| **Optimiser** | Module C & D | Recommended actions with schedule changes, model confidence and £ savings. **Recommend → Approve → Automate** control mode plus a per-action approve/automate flow. |
| **Meter Data** | Layer 1 – Energy Data OS | Import half-hourly consumption (long `timestamp,kwh` or wide `date,p1..p48` CSV), idempotent, with a quality report. Deterministic analysis prices the period at the live rate and surfaces overnight base load, peak demand, anomalies and a baseline-vs-recent **verified saving**. |
| **Sites** | Layer 1 – Energy Data OS | Portfolio of sites with controllable loads, meter type, spend, savings and status (Optimal / Watch / Anomaly). |
| **Settings** | Layer 1 – Energy Data OS | **Devices, Rate Plan, Smart Control, Hardware and Pause Connections**, wired to the device-connector service in `backend/` (`docs/SETTINGS_WIRING.md`). Connect Octopus (`API key` + account number) or a Solis inverter once per site; pills show *Connected · live / reconnect required / Paused*. Rate plans auto-fill from Octopus, `effective.sync_active` drives the pause cards, `423` is shown as *Paused* and never retried, and the Live data tab renders readiness, the hourly profile and yesterday's findings with their measured / estimate / possible-cause labels. |
| **Copilot** | Layer 2 – AI Energy Brain | A **grounded** chat assistant. The server computes the workspace numbers and the live market snapshot; Gemini narrates them (`POST /api/copilot/chat`). Falls back to deterministic answers and labels the source honestly when no key is set. The Copilot *explains*; the optimisation engine *decides*. |
| **Live Market** | Layer 1 – Energy Data OS | **Real-time UK market data, no keys.** The live half-hourly Agile Octopus price curve for the site's own distribution region (A–P, mapped from its Ofgem cap region), the cheapest and peak windows of the day, a live flexibility shift calculator priced off the real curve, and GB grid carbon intensity. Sources: `server/src/lib/live/`. |

| **Plans & Billing** | §6 Pricing | Starter **£49** / Growth **£149** / Autonomous **£249** per site/month, an interactive **performance-fee calculator** (15% of verified savings), flexibility revenue share, annual value summary and the plan’s worked business case. |

> **Going to market?** [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) is the
> production checklist plus the commercial pack: live vendor pricing (checked
> 7 Nov 2026), a minimum-viable budget, a financial model by scale, adoption
> research, competitor analysis, a hardware option, marketing and viability.

## The SaaS funnel (in this order)

```
/  landing  →  /start  free bill check  →  /sign-up  account
           →  /onboarding/subscription  choose plan + order summary
           →  /onboarding/payment  pay  →  /onboarding/payment-status  verified
           →  /dashboard
```

The order is deliberate: a visitor sees the money on their own bill **before** an
account exists, and an account exists **before** a plan is chosen. `/` is public,
`/features` and `/pricing` are public, and `/check` / `/get-started` still redirect
into `/start`.

Once paid, the console lives under the same routes as before — with the home
screen moved from `/` to **`/dashboard`** — so nothing about the product surface
changed except the front door.

## Subscriptions, plans and access

**One source of truth.** Plans, prices, features, restrictions and site caps live in
[`server/src/services/plans.ts`](server/src/services/plans.ts) and are served by
`GET /api/plans`. No component hardcodes a price or a limit.

| Plan | Price | Sites |
| --- | --- | --- |
| Starter | £49 / site / month | up to 3 |
| Growth (recommended) | £149 / site / month | up to 10 |
| Autonomous | £249 / site / month | up to 25 |

> **Two facts the README does not define, and therefore does not invent:** the
> README prices per site per **month** only, so annual billing is *disabled*
> (`annualBillingAvailable: false`) rather than given a made-up price; and it sets
> no cap per plan, so the site caps above are marked `provisional` in the catalogue
> and in the API payload. Change one file to adopt the real numbers.

**State machine** (`server/src/services/subscription.ts`):

```
none → pending → payment_pending → active → cancelled (at period end) → expired
                                     ↳ failed (retry from the payment status page)
```

* A plan choice is a **pending order** with an order summary (subtotal, VAT at 20%,
total) — it never activates anything.
* `POST /api/subscription/payments/:id/confirm` exists for **test mode only** (no
Stripe key). With Stripe configured, only the signature-verified webhook may settle
a payment, its amount is checked against the order, and every event id is recorded
once so a replay cannot activate or extend twice.
* Upgrades and downgrades keep the current plan live until the new payment is
verified. A downgrade below the current site count keeps every site and simply
blocks new ones.
* Access rules: signed out → `/sign-in`; no plan → `/onboarding/subscription`;
payment in flight → `/onboarding/payment-status`; failed → retry; expired → renewal;
active → `/dashboard`.

**Enforcement is server-side.** `requireActiveSubscription` guards the product routes
(`/api/workspace`, invoices, actions, analysis, copilot, consumption, connector) and
returns `402 subscription_required`. Site creation reserves a slot with a single
atomic compare-and-increment on the account, so parallel requests cannot exceed the
cap; the slot is released if the write fails. Published Ofgem data
(`/api/analysis/price-cap`) and the bill-check endpoints stay public.

Interactive behaviour is real: approving actions updates metrics, running an audit adds an
invoice and re-computes KPIs, and the fee calculator recalculates live.

> **New here: Smart Analysis is grounded, not simulated.** The findings come from
> `server/src/lib/analysis.ts`, checked against the real Ofgem price cap table
> (`server/src/lib/priceCap.ts`) and Elexon half-hourly temperature data
> (`server/src/lib/weather.ts`). Run `cd server && npm run verify:analysis` to
> re-validate the engine. See [`docs/IMPLEMENTATION_GUIDE.md`](docs/IMPLEMENTATION_GUIDE.md)
> for the data-source map and the plan of action. See
> [`docs/INTELLIGENCE_GUIDE.md`](docs/INTELLIGENCE_GUIDE.md) for how the Copilot
> and Bill Auditor are grounded on Gemini (engine decides, AI explains), and
> [`docs/ENERGY_SAVER_GUIDE.md`](docs/ENERGY_SAVER_GUIDE.md) for the roadmap to a
> total energy saver — data capture, cost analysis, the opportunity catalogue and
> the agentic loop.

## Live UK energy data (real-time)

`/live` is not a seeded snapshot — it pulls **actual GB market data** on every
load from two public, key-less feeds:

| Feed | What it gives | Provider |
| --- | --- | --- |
| **Octopus Energy public tariff API** | The half-hourly Agile Octopus unit rate for the site's distribution region (A–P, which map 1:1 onto Ofgem's 14 cap regions) | `api.octopus.energy/v1` — no key |
| **NESO Carbon Intensity API** | Current + next-24h gCO2/kWh for GB | `api.carbonintensity.org.uk` — no key |

From the real curve the server derives, deterministically
(`server/src/lib/live/derive.ts`): the price right now, the cheapest and most
expensive contiguous windows, and the £ saved by moving a flexible load from one
to the other — the arithmetic behind "charge the EV fleet 01:00–04:00". The
*engine decides* (here, which window is cheapest); the same discipline as the
bill auditor. A site's postcode resolves to the correct region through the same
cap-region heuristic the bill engine already uses.

Endpoints (all public — this is published market data):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/live/status` | Reachability of each feed + the 14 regions |
| `GET` | `/api/live/tariff?region=&postcode=&hours=&kwh=` | Price curve + cheapest/peak windows + a shift plan |
| `GET` | `/api/live/carbon` | Current + next-24h carbon intensity |
| `GET` | `/api/live/snapshot?…` | Everything above in one call |

Verify the derivations offline (17 checks, no network) or with a live smoke:

```bash
cd server
npm run verify:live          # deterministic, offline
npm run verify:live -- --net # also hits Octopus + NESO
```

Every feed degrades gracefully: if upstream is unreachable the endpoints return a
clear `503` and the rest of the app keeps working. `GET /api/health` now reports
`live: "octopus+carbon"`. Tune with `OCTOPUS_BASE_URL`, `AGILE_PRODUCT`,
`AGILE_REGION`, `CARBON_BASE_URL`, `LIVE_TIMEOUT_MS` and `LIVE_CACHE_TTL_MS`
(see `server/.env.example`).


## Tech stack

**Web** — React 19 + TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), React Router v7,
Recharts, lucide-react, `@clerk/clerk-react`.

**Mobile** — React Native (Expo 57), React Navigation (bottom tabs), `react-native-svg` charts,
lucide-react-native, `@clerk/clerk-expo`.

**Server** — Node + Express 4, MongoDB via Mongoose 8, Zod validation, `multer` multipart
uploads, `@clerk/express` for session verification, `@aws-sdk/client-s3` for Cloudflare R2.

## Run locally on Windows (PowerShell)

The web console, the Node API and the Python connector are **three processes**.
`npm run dev:all` starts all three with labelled output (`[web]`, `[api]`, `[py]`),
so the site stops showing `ECONNREFUSED` on port 4000 and
`npm run verify:connector` can reach port 8000.

Prerequisites: **Node.js 20.9+** (comes with npm) and **Python 3.10+**
(`python --version`). No MongoDB install is needed for local development.

Open PowerShell in the repository root (the folder containing `package.json`) and run,
in this order:

```powershell
npm run setup            # npm install (root + server), backend/.venv + requirements, .env with a generated ENCRYPTION_KEY
npm run dev:all          # web :3000  ·  Node API :4000  ·  Python connector :8000 (labelled output)
```

Leave that window running, open a **second** PowerShell window in the same folder, then:

```powershell
npm run verify:connector # Settings API checks through http://127.0.0.1:4000/api/connector
```

What you should see:

- `npm run setup` — `✓ Setup complete.` after installing root/server dependencies,
  creating `backend/.venv`, installing `backend/requirements.txt` and writing
  `ENCRYPTION_KEY` into `.env`.
- `npm run dev:all` — three labelled streams:
  `[web]` Next.js on `http://localhost:3000`, `[api]` `EnerOS API (in-memory) on
  http://localhost:4000`, `[py]` `Uvicorn running on http://127.0.0.1:8000`.
- `npm run verify:connector` — a list of `PASS` lines ending in
  `13/13 checks passed` (5 more pause-gate checks run when you set
  `VERIFY_CONNECTION_ID`).

Notes:

- `npm run setup` is idempotent; re-running it keeps your `.env` and virtualenv.
- All three services read the **one** `.env` at the repo root, so `APP_API_TOKEN`
  never drifts. It is gitignored — edit `.env.example` for shareable defaults.
- `npm run dev:all` runs the API with an in-memory MongoDB (`npm run dev:api`), so
  data is recreated on each start and the first run downloads a MongoDB binary
  once (~1–2 min). With a local `mongod`, use `npm run dev:api:mongo` instead.
- Stop everything with `Ctrl+C` in the `dev:all` window.
- Run one service on its own: `npm run dev:web`, `npm run dev:api`, or
  `npm run dev:backend`.


### 1. Backend (required by both clients)

```bash
cd server
npm install
cp .env.example .env         # optional — sensible defaults work out of the box
npm run seed                 # create the demo account + workspace in MongoDB
npm run dev                  # http://localhost:4000
```

No local `mongod`? Use the zero-config in-memory variant (data is ephemeral):

```bash
cd server
npm run dev:memory           # boots an in-memory MongoDB, seeds, then serves the API
```

Server scripts:

```bash
npm run dev        # tsx watch src/local.ts
npm run dev:memory # in-memory MongoDB + seed + serve (no mongod required)
npm run seed       # (re)create the demo account + dataset in MongoDB
npm run smoke      # end-to-end API test against an in-memory MongoDB (24 checks)
npm run verify:live  # live derivations + site flow (33 checks, offline)
npm run verify:copilot # Copilot + Auditor grounding (22 checks, offline)
npm run verify:gemini  # Gemini diagnostics: failure matrix + live check
npm run verify:safety   # autonomy safety policy + dispute letter (25 checks)
npm run verify:billing  # Stripe checkout + webhook signature (18 checks)
npm run verify:ingest   # CSV ingestion + consumption analysis (26 checks)
npm run verify:intake   # bill upload → audit → advice (13 checks)
npm run build      # tsc --noEmit
```

### 2. Web app

From the repository root (Next.js app, port 3000):

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run dev:all     # web :3000 + Node API :4000 + Python connector :8000
npm run build       # production build
npm run typecheck   # type-check only
```

### Deploying the web app and API to Vercel

The root [`vercel.json`](./vercel.json) configures two services in one Vercel
project. All `/api/*` requests route to the Express service; everything else
routes to the Vite service. Because the app is a client-routed SPA, the `app`
service declares its own `rewrites` rule sending any path that is not a real
static file to `/index.html`. That fallback is what makes direct visits and
refreshes on nested client routes work — notably Clerk's `/sign-in/*` and
`/sign-up/*` routes and their own sub-routes such as
`/sign-up/verify-email/:code`. Do **not** try to fix a 404 on those paths by
adding top-level rewrites with `destination: { "service": "app", "path": "/" }`:
per Vercel's Services routing docs, a destination `path` only selects which
route runs inside the service and does not change the path the service's own
filesystem lookup sees, so the static handler still 404s. The fallback has to
live inside the `app` service to work.

The API already mounts its routes at `/api`, so the browser uses same-origin
`/api/...` requests; leave `VITE_API_URL` unset for this deployment. Locally,
Vite proxies `/api` to `http://localhost:4000`.

Configure the API service's required secrets and connection settings in Vercel
environment variables (including `MONGODB_URI` and, when used,
`CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` and the `R2_*` variables). The
Express app is exported as a Vercel function and connects to MongoDB when API
requests arrive; `/api/health` can be used to verify the function is responding.
If `MONGODB_URI` is missing in Vercel, API requests return a JSON configuration
error. The mobile app is not a Vercel service; set `EXPO_PUBLIC_API_URL` to the
deployed origin when building it so it can reach the public `/api` routes.

### 3. Mobile app

```bash
cd mobile
npm install
npm run start      # Expo dev server — press a / i for Android / iOS
npm run typecheck  # tsc --noEmit
```

> **Python connector not starting?** [`docs/RUNNING_THE_CONNECTOR.md`](docs/RUNNING_THE_CONNECTOR.md)
> is the setup and troubleshooting runbook, and `npm run doctor` checks every prerequisite.

## Demo login (identical on web **and** mobile)

`npm run seed` prints the credentials; the defaults are:

| Field | Value |
| --- | --- |
| Email | `demo@eneros.app` |
| Password | `EnerOS-demo-2026` |

Both clients call `GET /api/config` on boot, discover the auth mode, and attach the same bearer
token (Clerk session JWT, or a dev-auth token when Clerk is unconfigured) to every API call. The
server derives a stable owner id (`clerk:<userId>` or `user:<email>`) from that identity, so the
web console and the phone app read and write the **same** MongoDB documents.

## Configuration

Everything is env-driven with safe local defaults.

**`server/.env`** (see `server/.env.example`): `MONGODB_URI`, `CLERK_PUBLISHABLE_KEY` /
`CLERK_SECRET_KEY`, `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`

**Optional billing** — `STRIPE_SECRET_KEY` (checkout), `STRIPE_WEBHOOK_SECRET`
(verify events) and `APP_BASE_URL` (redirect URLs). Without a Stripe key, checkout
runs in a clearly-labelled dev mode that activates a plan without taking payment.
(+ optional `R2_PUBLIC_BASE_URL`), `CORS_ORIGINS`, and the `DEMO_*` account. Clerk and R2 are
each *optional* — the server degrades gracefully when they are absent.

**`.env`** (web) may set `VITE_API_URL` to override the same-origin `/api` path
when the API is hosted separately. **`mobile/.env`** sets `EXPO_PUBLIC_API_URL`
to the API origin (for example, `http://localhost:4000` during local development).
Clerk keys are **not** duplicated there — clients read them from the API’s `/api/config`.

## Project structure

```
server/                    # shared API (single source of truth)
├─ src/
│  ├─ index.ts             # Express app export for Vercel
│  ├─ local.ts             # local boot: connect MongoDB, start Express
│  ├─ app.ts               # express app: CORS, JSON, Clerk middleware, routes
│  ├─ env.ts               # typed env + clerkEnabled / r2Enabled flags
│  ├─ db.ts                # Mongoose connection helpers
│  ├─ auth.ts              # requireUser / resolveIdentity (Clerk + dev tokens)
│  ├─ r2.ts                # Cloudflare R2 put / delete / presigned GET
│  ├─ models/index.ts      # Mongoose schemas (owner-scoped documents)
│  ├─ services/
│  │  ├─ workspace.ts      # load / provision / mutate a workspace
│  │  └─ catalog.ts        # plan + supplier catalogue
│  ├─ lib/
│  │  ├─ priceCap.ts       # Ofgem cap table (14 regions, quarterly) + postcode lookup
│  │  ├─ analysis.ts       # Smart Analysis engine — the deterministic checks
│  │  ├─ weather.ts        # Elexon TEMP → heating degree days (degrades gracefully)
│  │  ├─ llm.ts            # bill text → typed fields (forced tool call, optional)
│  │  ├─ document.ts       # PDF/text extraction from an uploaded invoice
│  │  ├─ live/             # live UK data — octopus.ts · carbon.ts · derive.ts · regions.ts

│  │  └─ audit.ts          # projects engine findings onto the legacy BillIssue shape
│  ├─ routes/              # auth · workspace · invoices · actions · uploads · analysis · account · config · live
│  ├─ seed/
│  │  ├─ data.ts           # the consistent 12-site demo dataset
│  │  └─ seed.ts           # `npm run seed` — creates demo user + workspace
│  └─ scripts/             # smoke.ts (e2e) · memory.ts (in-memory) · verify-analysis.ts (engine checks) · verify-live.ts (live checks)
└─ .env.example

src/                       # web console
├─ App.tsx                 # routes (public auth routes + gated console)
├─ main.tsx                # entry (fetches config, mounts Clerk provider)
├─ store.tsx               # API-backed state, derived metrics, mutations
├─ types.ts                # domain model (mirrors server/src/types.ts)
├─ index.css               # Tailwind v4 + design tokens
├─ lib/
│  ├─ api.ts               # REST client (bearer token per call)
│  ├─ auth.tsx             # unified Clerk / dev auth provider
│  ├─ clerkAppearance.ts   # Clerk theme shared by auth pages + user menu
│  ├─ format.ts            # en-GB £ / kWh / % formatting
│  └─ cx.ts                # classname joiner
├─ components/
│  ├─ AuthGate.tsx         # console gate (redirects to /sign-in)
│  ├─ UserMenu.tsx         # account menu + Clerk sign-out
│  ├─ Layout.tsx           # sidebar nav, top bar, toast host
│  ├─ ui.tsx               # Card, StatCard, Badge, ProgressBar, EmptyState
│  └─ auth/ClerkStates.tsx # Clerk load / failure placeholders
├─ pages/
│  ├─ Analysis.tsx         # Smart Analysis workbench
│  ├─ Bills · Optimiser · Sites · Copilot · Live · Plans · Dashboard
│  └─ auth/                # SignIn · SignUp · Welcome + the split-screen shell
└─ …

docs/IMPLEMENTATION_GUIDE.md   # data sources, architecture, phased plan of action

mobile/                    # React Native / Expo app (same API, same credentials)
```

## Mobile app (React Native / Expo)

`mobile/` is a React Native port of the same product. It consumes the **same API** as the web
app — the store, types and formatting helpers are mirrored from `src/`, and the UI kit, hand-rolled
SVG charts and six screens were rebuilt for a phone viewport. Auth is shared: the Expo app signs in
with Clerk (`@clerk/clerk-expo`, tokens cached in `expo-secure-store`) when configured, otherwise
with the same dev-auth demo login as the web app.

```bash
cd mobile
npm install
npm run start        # Expo dev server — press a / i for Android / iOS

npm run typecheck    # tsc --noEmit
npm run export       # expo export --platform ios (proves the bundle compiles)
```

| Web page | Mobile screen | Notes |
| --- | --- | --- |
| Dashboard | `src/screens/DashboardScreen.tsx` | KPI row, spend/expected area chart, asset + site bars, findings |
| Bill Auditor | `src/screens/BillsScreen.tsx` | Filter chips, audit sheet, issue recovery, Cloudflare R2 document upload |
| Optimiser | `src/screens/OptimiserScreen.tsx` | Recommend → Approve → Automate flow |
| Sites | `src/screens/SitesScreen.tsx` | Portfolio, controllable loads, status |
| Copilot | `src/screens/CopilotScreen.tsx` | Chat thread + suggestion chips + keyboard handling |
| Live Market | `src/screens/LiveScreen.tsx` | Real-time price curve (`PriceCurve`, react-native-svg), cheapest/peak windows, live shift calculator (`Slider`), grid carbon |

| Plans | `src/screens/PlansScreen.tsx` | Tiers, live performance-fee calculator (`Slider`), business case |

Mobile-specific adaptations:

- **No Tailwind / DOM.** Design tokens live in `src/theme.ts` and are mirrored into
  `StyleSheet.create`; charts are hand-written with `react-native-svg` (Recharts is DOM-only).
- **Shared auth.** `src/lib/auth.tsx` mirrors the web provider — Clerk via `@clerk/clerk-expo`
  (tokens cached in `expo-secure-store`, with an in-memory fallback on web) or the dev demo login.
- **`Intl` is not trusted on Hermes.** `src/lib/format.ts` provides RN-safe formatting and a
  hand-rolled `compactGbp`, since `notation: 'compact'` is not reliable.
- **`Chips` replaces `<select>`** and `KeyboardAvoidingView` wraps the Copilot thread.
- **`expo-document-picker`** powers the Bills screen’s “Upload PDF or photo” button (graceful
  `503` toast when the server has no R2 credentials); downloads open via the presigned URL.
- Six bottom tabs via `@react-navigation/bottom-tabs`, wrapped in `SafeAreaProvider` +
  `AppProvider`; `ToastHost` floats above the tab bar.

## Notes & assumptions

- **Data lives in MongoDB.** The server seeds a demo workspace per owner; both clients hydrate
  their store from `GET /api/workspace` and persist mutations through the API, so web and mobile
  always agree. `getWorkspace()` auto-provisions any new user if `AUTO_PROVISION=true`.
- **Auth & storage are optional.** With Clerk keys set, `requireUser` trusts the Clerk session
  JWT; without them the server issues its own signed dev tokens. Invoice PDFs/photos are stored
  in **Cloudflare R2** (private buckets are read back through short-lived presigned URLs); with no
  `R2_*` vars, uploads return `503` and the rest of the API still works.
- **The AI is real Gemini, grounded in computed data.** The Copilot (`POST /api/copilot/chat`),
  the audit narrator (`POST /api/analysis/narrate`) and bill extraction (`POST /api/analysis/extract`)
  all call Gemini with server-computed context; with no `GEMINI_API_KEY` they report `unavailable`
  and the clients say so plainly instead of inventing answers. (`server/src/lib/audit.ts` is not AI —
  it is a deterministic adapter that projects the rules engine onto the legacy invoice issue shape.)
- **Currency is GBP** and formatting is en-GB throughout, matching the UK SME focus.
- Pricing, the 15% performance fee and the 20–30% flexibility share follow the plan and are
  presented as *testable assumptions*, not fixed commitments — as the plan itself notes.
- Run `cd server && npm run smoke` to exercise auth, workspace, audit, action progression,
  control mode and recovery end-to-end (24 checks) against an in-memory MongoDB.
- Run `cd server && npm run verify:subscription` for the commercial journey (73 checks):
  register → locked out → choose plan → pay → verify → dashboard, the site cap including
  **parallel** adds, failed/cancelled/expired payments, upgrade/downgrade, tenant isolation,
  payment history and webhook idempotency.
- The web console's mobile sibling still signs in through the same API, so its workspace
  calls now need an active subscription too — the seeded demo account already has one.
- The web production bundle is a single chunk (~790 kB, mostly Recharts). Code-splitting per
  route would be the next optimisation if bundle size matters.
