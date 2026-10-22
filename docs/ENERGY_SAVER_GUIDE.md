# EnerOS — The Total Energy Saver: Implementation Guide

What to build to turn EnerOS from a strong billing/live-data console into a
**total energy saver**: a product that ingests a business's real energy data,
explains its cost line by line, finds every realistic saving, and then runs an
agentic loop that proposes, simulates, executes and *verifies* those savings.

Read alongside:
- [`../README.md`](../README.md) — what exists today.
- [`INTELLIGENCE_GUIDE.md`](./INTELLIGENCE_GUIDE.md) — the Copilot/Auditor and the
  "engine decides, AI explains" rule.
- [`IMPLEMENTATION_GUIDE.md`](./IMPLEMENTATION_GUIDE.md) — UK data sources.

---

## 1. The north star

> **Verified £ saved per site per year.**

Everything else is a means to that number. The product is not "a dashboard" or
"an AI chat" — it is a machine that finds money, proves it was saved, and keeps
finding more. That single metric drives every decision below:

| Layer | Question it answers | Metric it protects |
| --- | --- | --- |
| Data | Do we know what this site uses, when, and at what price? | data coverage % |
| Analysis | Where does the money go, and what is abnormal? | findings precision |
| Opportunities | What can realistically be changed? | £ identified |
| Agent | Can we do it, safely and with permission? | £ executed |
| Verification | Did it actually save money? | £ verified |

If a feature does not move data coverage, £ identified, £ executed or £ verified,
it is not part of the core build.

---

## 2. Where the product is today

Grounded in the current codebase — this is the starting inventory.

| Capability | Where it lives | State |
| --- | --- | --- |
| Bill audit engine (deterministic) | `server/src/lib/analysis.ts` | ✅ 10 checks, evidence per finding |
| Bill text extraction | `server/src/lib/llm.ts` (`extractBill`, Gemini schema) | ✅ |
| Audit narration | `server/src/lib/auditor.ts` | ✅ grounded on engine output |
| Live Agile prices + carbon | `server/src/lib/live/*` | ✅ real, key-less |
| Site energy-flow model | `server/src/lib/live/flow.ts` | ✅ modelled, priced live |
| Grounded Copilot | `server/src/lib/copilot.ts` + `/api/copilot/chat` | ✅ |
| Workspace/sites/invoices/actions | `server/src/models/index.ts`, `services/workspace.ts` | ✅ but thin |
| Web console | `src/pages/*` | ✅ Dashboard, Bills, Analysis, Optimiser, Sites, Copilot, Plans, Live |
| Mobile app | `mobile/src/screens/*` | ✅ parity-ish |

**What is thin or missing for "total energy saver":**

1. **Consumption data is modelled, not measured.** There is no half-hourly (HH)
   ingestion. `flow.ts` generates kW from spend; the product cannot yet say
   "you used X kWh at 17:30".
2. **Invoices are summaries,** not bills: no `periodStart/periodEnd`, no MPAN,
   no line-item breakdown (unit, standing, DUoS, capacity, CCL, VAT).
3. **No baseline.** Savings cannot be *verified* without a baseline → intervention
   → measured-outcome loop (the plan's Risk #1).
4. **Opportunities are a static seed list,** not generated per site from data.
5. **No agent loop.** Actions move Recommend → Approve → Automate, but nothing
   plans, simulates, executes or measures.
6. **Onboarding captures almost no data** (business name, site count, postcode).

---

## 3. Getting the customer's data (the real bottleneck)

No data, no savings. This is the highest-leverage build. Design for **minimum
friction at each step** and **automatic enrichment** wherever possible.

### 3.1 The onboarding wizard (replaces the current 3-field form)

A guided, resumable flow at `/onboarding`. Every step is skippable and shows the
value unlocked by completing it ("add HH data → unlock £X of tariff analysis").

| Step | Captures | Feeds | Friction |
| --- | --- | --- | --- |
| 1. Business | name, sector, sites, postcode(s) | cap region, benchmarks | low |
| 2. Site profile | type, floor area, opening hours, occupancy, trading days | load shape, low-occupancy windows | low |
| 3. Assets | HVAC, refrigeration, ovens, hot water, lighting, EV chargers, solar, battery — with count and rough size | controllable-load model, flexibility | medium |
| 4. Tariff | supplier, contract dates, unit rate(s), standing charge, DUoS, capacity charge, VAT/CCL | true cost model | medium |
| 5. Bills | upload/forward 12 months | history, anomalies, back-billing | medium |
| 6. Consumption | HH CSV or supplier consent | the whole optimisation layer | **high** |
| 7. Consent | data-sharing mandate, MPAN/MSN, contact | automated ingestion | low |

**Flow rules**
- **Progressive, not gated.** A user can reach "£ identified" after step 2 + 5
  (bill-based estimate), then improve accuracy with HH data.
- **Explain the why on every field** ("We use opening hours to find the
  low-occupancy periods where HVAC can safely drop 1°C").
- **Show a running value meter**: "Data confidence: 62% → add HH data for
  95%. Estimated saving so far: £12,400/yr."
- Persist drafts so a user can leave and return.

### 3.2 Data acquisition channels (in priority order)

| Channel | Mechanism | Effort | Coverage |
| --- | --- | --- | --- |
| **Bill upload** | PDF/photo → R2 → `document.ts` text → `extractBill` (Gemini) → typed invoice | already built | ~70% of SMEs have PDFs |
| **Bill email forwarding** | unique `bills+<token>@in.eneros.app` → parse attachments | new | removes manual upload |
| **HH CSV upload** | supplier portal export (Octopus, EDF, etc.) → column mapper → normalise to `{siteId, from, kwh}` | new | unlocks tariff/load analysis |
| **Supplier consent / DCC** | customer authorises data access (MPAN-based) | partnerships | full automation |
| **Meter/BMS API** | vendor APIs behind an abstraction layer | per-integration | controls |
| **Manual site form** | for the long tail | exists | low |

**CSV ingestion design (`server/src/lib/ingest/csv.ts`)**
- Accept common UK export shapes: date + 48 period columns, or long
  `timestamp,kwh`, or `MPAN,date,period,kwh`.
- Detect half-hourly vs hourly vs daily.
- Validate against the site's expected annual kWh; flag gaps and duplicates.
- Store idempotently (`siteId + periodStart` unique) so re-uploads don't double.
- Return a **quality report**: periods covered, gaps, estimated vs actual.

### 3.3 Data quality as a first-class concept

Add `Site.dataQuality = { consumption: 'none'|'bill-only'|'hh', coveragePct, lastReadingAt }`.
The UI must always say what it knows and what it is estimating. Every saving is
labelled **estimated** or **verified** based on this.

### 3.4 What to measure (minimum viable dataset)

To find real savings you need, per site:
- 12 months of bills (cost + kWh), and ideally HH kWh.
- opening hours + trading days (for occupancy-driven HVAC/lighting).
- tariff structure (ToU bands, standing, DUoS, capacity).
- asset inventory with controllable flags.
- weather (already available via `live/weather` / Elexon) for normalisation.

Everything else is a bonus.

---

## 4. Cost analysis engine (answer "where does the money go?")

### 4.1 Decompose the bill, don't just total it

Extend the invoice model and the engine to itemise:

```
Total cost = Σ(unit rate × kWh per band)
           + standing charge × days
           + DUoS (fixed + volumetric)
           + capacity charge (kVA × p/kVA/day)
           + Climate Change Levy (if applicable)
           + VAT
```

`server/src/lib/analysis.ts` currently checks unit vs cap, standing vs cap,
arithmetic, VAT, consumption vs baseline, standing dominance and ToU. Add:

| New check | What it catches |
| --- | --- |
| `duos-mismatch` | DUoS band misapplied vs the site's distribution area |
| `capacity-overrun` | billed kVA above agreed capacity |
| `ccl-misapplied` | CCL charged on non-eligible use |
| `estimated-readings-streak` | ≥2 consecutive estimated invoices (cash-flow + true-up risk) |
| `rate-creep` | unit rate rose mid-contract without a variation notice |
| `back-billing` | charges older than the 12-month back-billing limit |
| `vat-rate-error` | wrong VAT rate for the premises |
| `double-charge` | same period billed twice |

### 4.2 Benchmarking (make "normal" measurable)

- **Peer benchmark**: same site type + region, kWh/m² or kWh/cover.
- **Own-history benchmark**: last 12 months, degree-day normalised.
- Surface as: "Your refrigeration load is 24% above comparable sites" — the
  moat the plan describes.

### 4.3 Baseline & verification (the part that makes savings credible)

Implement IPMVP-style measurement & verification:

1. **Baseline model**: regress daily kWh against degree-days + trading days +
   occupancy over a pre-intervention window (`baseline` table per site).
2. **Intervention log**: every action records `appliedAt`, scope, expected delta.
3. **Measured outcome**: compare actual vs baseline-adjusted prediction over
   N weeks; report £ saved with a confidence interval.
4. **Never claim "verified" without this.** Show the methodology inline.

This directly answers the plan's Risk #1 ("savings aren't measurable").

---

## 5. The savings opportunity catalogue

Turn "recommendations" from a seed list into a **generated catalogue** per site.
Each opportunity has: trigger, evidence, £ estimate, confidence, effort, control
mode required, and a verification method.

Group by the four value levers the plan sells:

### A. Tariff & procurement (no hardware)
- Switch to a ToU/HH tariff matched to the actual load curve.
- Right-size capacity charge; renegotiate standing charges.
- Recover billing errors and back-billing (existing auditor).
- Align contract end dates to avoid out-of-contract rates.

### B. Load shifting (flexibility, no capex)
- Move EV charging into the cheapest half-hours (already modelled in `flow.ts`).
- Preheat/cool before the peak instead of during it.
- Shift defrost cycles, dishwashing, hot-water heating out of peak.
- Battery arbitrage where a battery exists.

### C. Efficiency (small capex)
- Refrigeration: door seals, night blinds, setpoint, condenser cleaning.
- HVAC: setpoint tuning, scheduling to occupancy, economiser checks.
- Lighting: LED + controls; kitchen extract scheduling.
- Hot water: insulation, setpoint, legionella-aware scheduling.

### D. Demand reduction / anomaly repair
- Overnight base-load excess (failing compressor, left-on equipment).
- Schedule drift vs opening hours.
- Power-factor / kVA overrun.

**Generation algorithm** (`server/src/lib/opportunities/`):
```
for each site:
  compute load shape (HH or bill-derived)
  compute tariff bands
  for each rule in CATALOGUE:
    if rule.preconditions(data, site):        # deterministic
      estimate = rule.estimate(data, site)    # kWh × price × confidence
      if estimate.gbp > threshold: emit(opportunity)
  rank by £, then effort
```

Keep it deterministic and testable, exactly like `analysis.ts`. The LLM may
*narrate* an opportunity but never invent one.

---

## 6. Agentic mode — how EnerOS actually acts

The agent is the difference between an analytics product and an operating
system. Design it as a **closed, auditable loop**, not an autonomous chatbot.

### 6.1 The loop

```
OBSERVE   ingest bills + HH + prices + weather + asset state
   ↓
DIAGNOSE  cost decomposition, anomalies, benchmark gaps
   ↓
PROPOSE   catalogue of opportunities with £, confidence, effort
   ↓
SIMULATE  model the change against history (expected £ + risk)
   ↓
APPROVE   human approves (respect Recommend → Approve → Automate)
   ↓
EXECUTE   via an asset abstraction layer (BACnet/Modbus/vendor APIs)
   ↓
VERIFY    baseline vs actual over N weeks; report £ with CI
   ↓
LEARN     feed outcomes back into estimates and confidence
```

### 6.2 Agent architecture (concrete)

- **Planner** (deterministic): decides *which* opportunities are actionable this
  cycle from data + rules. The LLM does not plan; it explains and drafts comms.
- **Simulator**: replays a proposed schedule against historical HH + prices to
  produce expected £ and a risk flag (e.g. temperature comfort bounds).
- **Policy engine**: hard guardrails — comfort bounds, food-safety limits, max
  kW shift, blackout windows, spend caps. A proposal that violates policy is
  rejected before it reaches a human.
- **Executor**: talks to assets only through an **abstraction layer**
  (`server/src/lib/assets/%vendor%`), never vendor-specific logic in the planner.
- **Verifier**: owns the baseline and produces the verified-£ number.
- **Audit log**: every observation, proposal, approval, command and outcome is
  stored immutably (who/what/when/why).

### 6.3 Tools the agent exposes (and the Copilot can call)

| Tool | Purpose |
| --- | --- |
| `get_site_usage(siteId, from, to)` | HH/derived consumption |
| `get_cost_breakdown(siteId, period)` | itemised bill |
| `get_live_prices(region)` | cheap/peak windows |
| `get_benchmark(siteId)` | peer + own-history comparison |
| `propose_action(siteId, kind, params)` | creates a *proposed* action |
| `simulate_action(actionId)` | expected £ + risk |
| `execute_action(actionId)` | only if approved + policy-passed |
| `verify_action(actionId)` | measured outcome + CI |

The Copilot becomes the natural-language front end to these tools — grounded,
auditable, and never able to skip approval.

### 6.4 Trust ladder (keep the plan's Risk #3 mitigation)

- **Recommend**: agent proposes; nothing executes.
- **Approve**: one-click approval per action (current default).
- **Automate**: pre-approved *classes* of action within policy bounds.
- Always show a **kill switch** and a per-site autonomy scope.

---

## 7. UI/UX and flow changes

### 7.1 Information architecture

Current nav: Dashboard · Smart Analysis · Bill Auditor · Optimiser · Sites ·
Copilot · Plans · Live Market.

Proposed (customer-outcome led):
1. **Home** — "You saved £X this month; £Y is waiting for approval."
2. **Savings** — opportunities + verification (the money screen).
3. **Energy** — live flow, price, carbon (the existing Live page).
4. **Bills** — auditor + upload/forward.
5. **Sites** — portfolio + data quality per site.
6. **Assistant** — Copilot with tool access.
7. **Settings** — tariff, consent, autonomy, integrations.

Keep "Smart Analysis" as a tool inside Bills rather than a top-level tab.

### 7.2 Screen-by-screen changes

**Onboarding (`/onboarding`)** — multi-step wizard (§3.1) with a live value meter.

**Home**
- Hero: verified savings this month + annualised run-rate.
- "Waiting for you": approvals queue with £ and one-click approve.
- Data-confidence chip per site ("bill-only", "HH").
- Live price + cheapest window today.

**Savings**
- Cards/table: opportunity · site · £/yr · confidence · effort · status.
- Bulk approve; per-action simulate drawer.
- Verified tab: baseline vs actual chart + measured £ with a confidence interval.

**Energy (live)**
- Keep the 1app-style flow diagram; add **measured vs modelled** labelling.
- Add a "cost now" ticker using live price × current kW.

**Bills**
- Upload, **email-forward address**, and HH CSV import in one place.
- Invoice detail: itemised cost breakdown + findings + "challenge" workflow.
- Back-billing clock and estimated-reading streak warnings.

**Sites**
- Data-quality score, reads "Add HH data → +£X identified".
- Operating hours + asset inventory editors.

**Assistant**
- Full-height chat (already done) + **tool cards** ("I checked your prices…").
- Action proposals rendered as approval cards, not just text.

**Global**
- Empty states that *sell the next data step*.
- Autonomy control visible in the header (Recommend/Approve/Automate).
- Every £ shows estimated vs verified.

---

## 8. Data model and API additions

### 8.1 New/extended models (`server/src/models/index.ts`)

```ts
// Extended Site
operatingHours?: { day: 0..6; open: string; close: string }[];
assets?: { kind: string; count?: number; sizeKwp?: number; controllable: boolean }[];
tariff?: { unitP: number; standingP: number; duosP?: number; capacityKva?: number; bands?: unknown[] };
dataQuality?: { consumption: 'none'|'bill-only'|'hh'; coveragePct: number; lastReadingAt?: string };
contractStart?: string; contractEnd?: string;

// Extended Invoice
periodStart?: string; periodEnd?: string; mpan?: string;
breakdown?: { unit: number; standing: number; duos: number; capacity: number; ccl: number; vat: number };
isEstimate?: boolean; receivedAt?: string;

// New: half-hourly consumption
ConsumptionModel { ownerId, siteId, from: Date, kwh: number }  // unique(siteId, from)

// New: opportunity
OpportunityModel {
  ownerId, id, siteId, kind, title, detail,
  estimatedGbp, confidence, effort,
  status: 'identified'|'approved'|'executing'|'verifying'|'verified'|'rejected',
  controlMode, evidence[], createdAt, appliedAt?, verifiedGbp?, verifiedAt?
}

// New: baseline
BaselineModel { ownerId, siteId, method, params, periodFrom, periodTo, rmse, createdAt }

// New: audit log
AgentEventModel { ownerId, siteId, type, payload, actor, at }
```

### 8.2 New API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/onboarding/step` | Save a wizard step; return next step + value meter |
| `POST` | `/api/bills/upload` | Upload PDF/photo (exists, extend to itemise) |
| `POST` | `/api/bills/forward-address` | Issue/rotate the email-forward token |
| `POST` | `/api/consumption/import` | HH CSV → normalise → quality report |
| `GET` | `/api/consumption/:siteId` | HH series for charts/baseline |
| `GET` | `/api/cost/:siteId/breakdown` | Itemised cost |
| `GET` | `/api/opportunities?siteId=` | Generated catalogue, ranked by £ |
| `POST` | `/api/opportunities/:id/simulate` | Expected £ + risk |
| `POST` | `/api/opportunities/:id/approve` | Approve (respects control mode) |
| `POST` | `/api/opportunities/:id/execute` | Execute if approved + policy-passed |
| `POST` | `/api/opportunities/:id/verify` | Measured outcome + CI |
| `GET` | `/api/baseline/:siteId` | Baseline model + fit quality |
| `GET` | `/api/agent/events?siteId=` | Audit log |

All agent endpoints are bearer-authenticated and scoped to the owner. Execution
endpoints additionally require the site's control mode to permit it.

---

## 9. Phased roadmap

Each phase ships something a customer can feel, and each has acceptance criteria.

### Phase 1 — Data foundation (2–3 weeks)
- Onboarding wizard with value meter.
- Extended invoice model + itemisation.
- HH CSV import + data-quality report.
- Data-quality chips across the UI.
- **Done when:** a customer can get from signup to "we analysed 12 months and
  X% of your half-hours" without talking to anyone.

### Phase 2 — Cost analysis & opportunities (2–3 weeks)
- New bill checks (DUoS, capacity, CCL, back-billing, rate creep).
- Peer + own-history benchmarking.
- Opportunity catalogue (deterministic) with £/confidence/effort.
- Savings page.
- **Done when:** the catalogue produces ranked £ opportunities for every site
  with bill data.

### Phase 3 — Agent loop (3–4 weeks)
- Baseline builder + verifier.
- Simulator.
- Policy engine + asset abstraction layer (start with read-only/virtual assets).
- Approve → execute → verify loop with audit log.
- Copilot tool-calling over the same tools.
- **Done when:** an approved action can be simulated, executed (or virtually
  executed), and verified against baseline with a CI.

### Phase 4 — Automation & flexibility (3–4 weeks)
- Automate mode within policy bounds.
- Real asset integrations (one or two vendors).
- Flexibility aggregation (NESO/DNO windows).
- Electricity + gas (if in scope).
- **Done when:** at least one site runs autonomously within guardrails and
  verified savings are reported monthly.

### Phase 5 — Scale (ongoing)
- Multi-vertical models (retail, logistics, manufacturing).
- Benchmark network effects (cross-customer intelligence).
- Tariff switching with a licensed partner.

---

## 10. Metrics and instrumentation

Instrument the north star and its inputs from day one.

| Metric | Definition | Target direction |
| --- | --- | --- |
| Data coverage | % of sites with HH + 12m bills | ↑ |
| Findings precision | % of engine findings a supplier accepts | ↑ |
| £ identified / site / yr | sum of open opportunities | ↑ |
| £ executed / site / yr | approved + executed | ↑ |
| £ verified / site / yr | measured after intervention | ↑ |
| Time to first value | signup → first £ identified | < 10 min |
| Approval rate | approved / proposed | ↑ (signal of trust) |
| Estimate error | predicted vs verified £ | ↓ |

Add a small analytics event on every step: `onboarding_step`, `data_imported`,
`opportunity_proposed`, `opportunity_approved`, `opportunity_executed`,
`opportunity_verified`, `copilot_message`.

---

## 11. Guardrails, compliance and safety

- **Consent is explicit and recorded.** Smart-meter/HH data access is
  consent-gated at the supplier. Store the mandate, scope and expiry.
- **Never execute without permission.** Policy engine + control mode are hard
  gates, not UI suggestions.
- **Comfort and food safety bounds** are non-negotiable for HVAC/refrigeration.
  Encode them per site type and refuse out-of-bounds proposals.
- **Data protection.** Bill data can be personal data for sole traders. Keep
  PDFs out of logs, encrypt at rest (R2), set retention, honour deletion.
- **Regulatory.** Don't act as a supplier/broker/trading counterparty; partner
  with licensed parties for switching/flexibility. Quote licence conditions
  accurately (SLC 21.5A, BAL, P483, MHHS).
- **Auditability.** Every agent action is in an immutable log with actor and
  reason. An auditor must be able to reconstruct any decision.

---

## 12. Testing and verification

Follow the existing pattern: deterministic suites plus graceful degradation.

```bash
cd server
npm run verify:analysis     # bill engine
npm run verify:live         # live derivations + flow
npm run verify:copilot      # LLM grounding
npm run smoke               # end-to-end API
```

Add:
- `verify:ingest` — CSV normalisation, gaps, duplicates, idempotency.
- `verify:cost` — itemised bill maths vs fixtures.
- `verify:opportunities` — each rule fires/doesn't on crafted inputs.
- `verify:baseline` — regression recovery on synthetic data with known savings.
- `verify:agent` — policy rejects out-of-bounds; execute blocked without approval;
  verify computes expected £ on a synthetic intervention.

LLM paths stay stubbed in CI (as `verify:copilot` already does) so tests never
need a key or network.

---

## 13. Recommended build order (next 10 working days)

1. **Day 1–2** — Extended Site/Invoice models + migration-safe defaults.
2. **Day 3–4** — Onboarding wizard step 1–3 with value meter.
3. **Day 5–6** — HH CSV import + data-quality report + `verify:ingest`.
4. **Day 7** — Itemised cost breakdown + `verify:cost`.
5. **Day 8** — Opportunity catalogue v1 (shift + efficiency + tariff) +
   `verify:opportunities`.
6. **Day 9** — Savings page with approve/simulate.
7. **Day 10** — Baseline v1 + verified-savings card; wire the loop end to end.

Ship Phase 1 and 2 before building automation. Data and trust come first; an
agent without measured data is just an opinion.


---

## 14. Business-plan alignment (what shipped in this pass)

The product is being tuned to the *EnerOS UK business plan*. This pass implemented
the plan-specific pieces that were missing:

| Plan requirement | Status | Where |
| --- | --- | --- |
| **Free bill check, no registration** | ✅ built | `/check` page + `POST /api/public/bill-check` (public, rate-limited, runs the real engine, never persists) |
| **Dispute letters** | ✅ built | `server/src/lib/dispute.ts` + `POST /api/analysis/dispute-letter` + "Download letter" in Smart Analysis |
| **Pricing £49 / £149 / £249** | ✅ updated | `server/src/services/catalog.ts`, seed, all plan types (`starter` / `growth` / `autonomous`) |
| **Never control refrigeration / freezers / alarms / safety equipment** | ✅ enforced | `server/src/lib/autonomy/policy.ts`, hard gate in `routes/actions.ts` (422 on illegal automation) |
| **Gemini for bill extraction + recommendations** | ✅ built | `lib/llm.ts` extraction, `lib/copilot.ts` grounded chat, `lib/auditor.ts` narration |
| Bill validation + verified savings | 🟡 partial | engine + auditor done; verification/baseline is §4.3 (next) |
| Half-hourly import / smart-meter integration | ⬜ planned | §3.2 |
| **Stripe subscriptions** | ✅ built | `lib/billing/stripe.ts`, `routes/billing.ts` (checkout + signed webhook), Plans page checkout |
| Next.js (plan) vs current Vite SPA | ⚠️ differs | see gaps below |

### Known gaps versus the plan (deliberate)

- **Framework.** The plan specifies Next.js; the app is currently a Vite + React
  SPA with an Express API. The product behaviour is unaffected, and a Next.js
  migration is a separate, mechanical project. Do it only if SSR/SEO for the
  marketing pages matters more than shipping features.
- **Payments.** ✅ Stripe Checkout (per-site quantity) + signature-verified webhook
  now update `Account.planId` and subscription state. Without a key the API runs a
  clearly-labelled dev mode that activates a plan without payment.
- **Background jobs.** Add a daily Vercel/Cloudflare cron hitting an authenticated
  `/api/jobs/daily` for price snapshots, anomaly sweeps and verification runs.
- **Smart-meter integrations.** Phase 3+ per §3.2; start with CSV import.

### The plan's own next step (Months 0–1)

> "Interview 20 hospitality owners, collect 20 electricity bills, secure three
> pilot sites, and launch the free bill checker."

The free bill checker is now live. The remaining Months 0–1 work is **commercial,
not engineering**: run 20 interviews, feed the 20 bills through `/check`, and use
the findings as the pilot pitch. Every bill that produces a £ figure is a lead.

