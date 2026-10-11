# EnerOS — Implementation Guide

How to take EnerOS from "working prototype" to "in production with real UK
electricity bill data". This is the plan of action, the data map, and the
architecture behind the Smart Analysis engine.

Read this alongside `README.md` (what exists today) — this document is about
what happens next.

---

## 1. What is built now

Two things were added in this pass, both production-shaped rather than
demonstrations.

### 1.1 Clerk-only authentication

| Route | Purpose |
| --- | --- |
| `/sign-up` | Clerk `<SignUp>` embedded in the EnerOS shell |
| `/sign-in` | Clerk `<SignIn>` embedded in the EnerOS shell |
| `/welcome` | Post-sign-up onboarding (business name, site count, postcode) |
| everything else | Gated by `AuthGate`; signed-out users redirect to `/sign-in` |

Clerk's hosted components render at real URLs (`routing="path"`), so
`/sign-up/verify-email/:code`, forgot-password and reset-password all work and
survive a page refresh. The theme lives in one file
(`src/lib/clerkAppearance.ts`) so the sign-up screen, sign-in screen and the
user menu cannot drift apart.

**Two bugs were fixed to make this work — do not undo them:**

1. `server/src/env.ts` only read `CLERK_PUBLISHABLE_KEY`, but `.env` set
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Clerk was therefore silently disabled and
   the app fell back to dev auth. Both names are now accepted.
2. `clerkMiddleware()` defaults to reading the publishable key **from each
   request** (header/query param), which a browser never sends. Once Clerk was
   correctly enabled, *every* route — including public ones — returned
   `"Publishable key is missing"`. `server/src/app.ts` now passes both
   `secretKey` and `publishableKey` explicitly.

> **Rule for the future:** after any auth change, check `GET /api/health`.
> `auth` must read `"clerk"` in production and protected routes must return 401
> for an unauthenticated request.

### 1.2 Smart Analysis engine

A deterministic rules engine, not a demo heuristic. `server/src/lib/analysis.ts`
runs independent checks against published reference data and returns findings
that carry their own evidence:

| Code | Check | Source |
| --- | --- | --- |
| `unit-rate-above-cap` | Billed p/kWh vs Ofgem cap for the site's region | Ofgem cap table |
| `standing-charge-above-cap` | Billed p/day vs regional cap | Ofgem cap table |
| `total-overstated` | Does kWh × rate + standing × days equal the total charged? | The bill itself |
| `total-understated` | Same check, inverse — credit or misprint | The bill itself |
| `vat-removal-not-applied` | VAT charged during the Oct 2026 – Mar 2027 relief window | DESNZ / Ofgem |
| `consumption-above-baseline` | Usage vs the site's own history | Site history |
| `half-hourly-required` | ≥ 250,000 kWh/yr triggers the BAL HH threshold | BAL policy |
| `site-too-small-for-contract` | Standing charge dominating a low-usage bill | Tariff model |
| `standing-charge-dominates` | Mis-shaped tariff | Tariff model |
| `time-of-use-opportunity` | Off-peak share vs flat rate | Tariff model |

**The design rule that makes this defensible: the engine decides, the LLM
explains.** Every finding is arithmetic against a published source, so a
customer (or an auditor) can challenge it. The LLM is only used to *read* a bill,
never to judge it.

Verify the engine any time:

```bash
cd server && npm run verify:analysis   # 24 checks, must be 24/24
---

## 2. Where UK electricity data actually comes from

This is the part most product plans get wrong. There is **no free public API of
UK retail electricity bills.** What exists is a set of layers, and you need all
of them.

### Layer 1 — Published reference data (free, public, authoritative)

| Source | What it gives | Access |
| --- | --- | --- |
| **Ofgem price cap tables** | Unit rate + standing charge for all 14 GB regions, quarterly | `ofgem.gov.uk` — transcribed into `server/src/lib/priceCap.ts` |
| **Ofgem licence conditions** | The legal basis for every finding (e.g. SLC 21.5A) | `ofgem.gov.uk` |
| **Elexon Insights API** (`api.elexon.co.uk/insights/api`) | Half-hourly temperature (`TEMP`), demand (`INDDEM`, `INDO`), transmission system data (`ITSDO`), generation by fuel (`FUELHH`) | **Public, no API key.** Register-free. |
| **Elexon BMRS** | Historical settlement volumes, non-energy cash-out | Public download / API |
| **NESO (National Energy System Operator)** | Demand forecasts, flexibility service windows | `neso.energy` data portal |
| **Ofgem Data Portal** | Licence-holder data, tariff comparison data, CMR | `ofgem.gov.uk/data-portal` |

> Elexon's developer portal states plainly: *"All our APIs are public and no API
> key is required."* This is the single most useful free resource for a UK energy
> product. `server/src/lib/weather.ts` already uses `TEMP`.

### Layer 2 — Your customer's own documents (this is the real product)

| Input | How you get it | Notes |
| --- | --- | --- |
| **Bill PDF / photo** | User upload → Cloudflare R2 (already wired) | The dominant case. `server/src/lib/document.ts` parses the PDF text layer. |
| **Smart meter data** | Supplier portal export (CSV), or a smart-meter API partner | Usually requires the customer's login or a data-sharing consent |
| **Half-hourly data** | Request from the supplier, or HH settlement via the customer's DNO/supplier | Not public. This is what unlocks optimisation. |
| **MPAN / meter details** | User enters it; validated against MPAS/DNO data | 11-digit MPAN identifies the supply point |

### Layer 3 — Commercial / paid

| Source | Use it when |
| --- | --- |
| **Supplier tariff APIs / price comparison feeds** | You need live market pricing to recommend a switch |
| **Smart meter data aggregators** (Kraken, LEEWAY, Landis+Gyr and similar) | You need automated consumption ingest without asking the customer to export CSVs |
| **Cornwall Insight / ODGER / metering consultancies** | You need market size or wholesale forecasting |
| **Ofgem Licence Condition 21A / CCR data** | You need to prove tariff compliance claims |

### What you should NOT try to build
Do not attempt to scrape supplier websites for pricing — it breaks their terms,
is legally fragile, and goes stale in days. Use the licensed feeds or ask the
customer.
---

## 3. The architecture, end to end

```
   ┌──────────────┐    ┌───────────────┐    ┌──────────────────────┐
   │  Bill PDF /  │───▶│  R2 object    │───▶│  Text extraction     │
   │  photo / CSV │    │  (encrypted)  │    │  document.ts         │
   └──────────────┘    └───────────────┘    └──────────┬───────────┘
                                                         │ raw text
                                                         ▼
                                             ┌──────────────────────┐
                                             │  LLM extraction      │
                                             │  llm.ts (forced tool │
                                             │  call → typed JSON)  │
                                             └──────────┬───────────┘
                                                        │ BillInput
     ┌──────────────────────────────────────────────────┤
     │                                                  ▼
     │  ┌───────────────────────────────────────────────────────────┐
     │  │  Reference data                                         │
     │  │  priceCap.ts  (Ofgem cap, 14 regions)                    │
     │  │  weather.ts   (Elexon TEMP → degree days)                │
     │  └───────────────────────────────────────────────────────────┘
     ▼                          ▼
   ┌────────────────────────────────────────┐
   │  analysis.ts — deterministic engine   │───▶ AnalysisFinding[]
   │  10 checks, each with evidence         │     (code, severity,
   └────────────────────────────────────────┘      evidence, £ impact,
              ▲                                   confidence,
              │  site history (baseline)           recommendation)
   ┌──────────┴──────────┐
   │ MongoDB: sites,     │
   │ invoices, uploads   │
   └─────────────────────┘
```

**Why the split matters commercially:** the rules engine is the part you can
*defend*. "You were billed 34.5p/kWh when the Ofgem cap for North Western
England is 26.49p — that's 8.01p × 10,000 kWh = £801, under SLC 21.5A" survives a
dispute with the supplier. "Our AI thinks you were overcharged" does not.

---

## 4. Plan of action

### Phase 1 — Ship what exists (1 week)

- [ ] Create the Clerk application at <https://dashboard.clerk.com>
- [ ] Enable the sign-up attributes you need (company name, phone)
- [ ] Enable email verification + a social provider (Google/Outlook) — SMEs expect it
- [ ] Add the production domain to Clerk's allowed origins
- [ ] Set on Vercel: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `MONGODB_URI`, `R2_*`
- [ ] Set `GEMINI_API_KEY` to switch on bill extraction and the Copilot
- [ ] Deploy, then check `GET /api/health` reports `auth: clerk`

### Phase 2 — Make the engine earn its keep (2 weeks)

The engine currently sees one bill at a time with a site-level baseline. These
are the checks that turn it from "useful" into "unmissable":

1. **Back-billing detection.** Flag any invoice whose period start is earlier
   than the previous invoice's period end — this is a back-bill, and under
   `SLC 21.10A` the customer has **three months** to dispute it. That clock is
   the single most valuable thing your product can put on the dashboard.
2. **Contract history rate creep.** Track the unit rate per site per invoice.
   Suppliers raise rates mid-contract far more often than customers notice.
   *Needs:* `contractStart` / `contractEnd` per site.
3. **Estimated-reading tracking.** Consecutive `isEstimate` invoices mean the
   customer is on estimated readings and is being billed for real money it did
   not use. *Needs:* the LLM's `isEstimate` flag persisted on the invoice.
4. **True-up reconciliation.** Model vs actual: once you have HH data, compare
   what the optimisation engine *said* would happen against the invoice.
### Phase 3 — Real half-hourly data (4–6 weeks)

This is where EnerOS stops being a bill auditor and becomes an energy manager.

1. **Meter ingest.** Start with CSV upload from supplier portals (no integration
   required, works today). Then evaluate a smart-meter data partner for
   automation.
2. **Normalise into a shape the engine can use:** `{ siteId, timestamp, kwh }`
   at 30-minute resolution, stored in MongoDB (or TimescaleDB if volume justifies
   it — roughly 35,000 rows per site per year).
3. **Baseline + anomaly detection.** Per site, fit a baseline on
   *degree-day-normalised* consumption (you already have `weather.ts`), then flag
   deviations by z-score per time-of-day band.
4. **Tariff optimisation.** With a real load profile you can answer the question
   that actually matters: *does this site beat better on Economy 7, Agile, or a
   half-hourly rate, and when does that break even?* Answer it with arithmetic
   from the load curve, not a rule of thumb.
5. **Flexibility.** Once you have HH data and controllable assets, stack them for
   DNO/NESO flexibility revenue. This is the "second revenue stream" in the
   business plan — it only becomes real at this phase.

### Phase 4 — Copilot becomes real (2 weeks)

`src/pages/Copilot.tsx` is currently keyword-matched demo text. Replace it with:

- **Grounded retrieval.** Give the model the workspace numbers as tool calls
  (`get_spend(siteId, period)`, `get_findings(invoiceId)`, `get_cap_period()`).
  Never put raw data in the prompt.
- **Anomaly explanations.** "Why is Harbour House 22% above baseline?" → the model
  calls the anomaly endpoint and explains, citing the numbers it was given.
- **Keep the rule.** The Copilot explains; `analysis.ts` decides. Do not let the
  model produce findings.

### Phase 5 — Commercial (ongoing)

- Recovery claims workflow with a **15% performance fee** (pricing is already in
  `server/src/services/catalog.ts`).
- Multi-site rollout: importing 40 sites from one CSV.
- Supplier switching: only once you have a licensed tariff feed.

---

## 5. Keeping the cap table current

This is a recurring obligation, not a one-off. Ofgem republishes quarterly:

| Period | Announced |
| --- | --- |
| 1 Jan – 31 Mar 2027 | **25 Nov 2026** |
| 1 Apr – 30 Jun 2027 | **23 Feb 2027** |
| 1 Jul – 30 Sep 2027 | **26 May 2027** |

To refresh:

1. Get the new table from Ofgem's *Energy price cap unit rates and standing
   charges* page.
2. Add a new `CapPeriod` to `CAP_PERIODS` in `server/src/lib/priceCap.ts` and
   move `currentCapPeriodId` to it. **Nothing else hard-codes cap values.**
3. Update `verify-analysis.ts` if any threshold changed.
4. Run `npm run verify:analysis`.
5. Deploy — `/api/analysis/price-cap` caches for one hour, so the data change
   takes effect as soon as the new code is running.

**Set a calendar reminder for each announcement date.** An app that benchmarks
against a stale cap will confidently produce wrong findings, which is worse than
producing none.

---

## 6. Environment variables

Full annotated template: `server/.env.example`.

**Required in production**

| Variable | Notes |
| --- | --- |
| `MONGODB_URI` | Atlas connection string |
| `CLERK_PUBLISHABLE_KEY` | Served to the browser via `/api/config` |
| `CLERK_SECRET_KEY` | Server only — verifies session JWTs |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Bill PDFs |

**Optional — the app degrades gracefully without each**

| Variable | Without it |
| --- | --- |
| `GEMINI_API_KEY` | Bill extraction and Copilot disabled; manual entry still works |
| `ELEXON_BASE_URL` | Weather normalisation off; anomalies are unadjusted |
| `AUTO_PROVISION` | Set `false` in production so real sign-ups get an empty workspace, not the demo dataset |

> `AUTO_PROVISION=true` (the current default) seeds the 12-site demo dataset for
> **every new Clerk user**. That is right for a pitch and wrong for production.
> Turn it off before you invite real customers.
---

## 7. Compliance notes worth knowing early

- **Elexon/BMRS data** is governed by the BMRS Data Licence Terms. Non-commercial
  use needs attribution; commercial use may need a licence. Check before you build
  a paid product on top of it.
- **Ofgem price cap data** is published information and safe to use, but the
  *licence conditions* you cite are legal references — quote them accurately.
- **Bill data is personal data** for sole traders and some partnerships. You need
  a lawful basis, a retention policy, and to keep PDFs out of logs. R2 is
  encrypted at rest; make sure you are not logging request bodies.
- **Recovering money on a customer's behalf** can make you an agent with
  obligations. This is a legal question, not an engineering one — get it answered
  before you invoice a recovery fee.
- **Smart meter data is sensitive** and access is consent-gated at the supplier.
  Never attempt to obtain it without an explicit, documented customer mandate.

---

## 8. API surface added

All under `/api`, all bearer-token authenticated except the two marked public.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/analysis/price-cap` | **Public.** Full cap table + period metadata, cached 1 h |
| `GET` | `/api/analysis/region?postcode=` | **Public.** Postcode → cap region |
| `POST` | `/api/analysis/bill` | Run the engine. Nothing persisted. `?includeWeather` adds degree days |
| `POST` | `/api/analysis/extract` | Paste bill text → LLM extraction → engine. 503 without a key |
| `GET` | `/api/analysis/portfolio` | Re-run the engine over stored invoices, rolled up per site |
| `GET` | `/api/account/profile` | Onboarding profile (company, site count, postcode, region) |
| `PUT` | `/api/account/profile` | Save it. Resolves the postcode to a cap region |
| `GET` | `/api/live/status` | **Public.** Reachability of the Octopus + NESO feeds, and the 14 regions |
| `GET` | `/api/live/tariff?region=&postcode=&hours=&kwh=` | **Public.** Live half-hourly curve + cheapest/peak windows + a shift plan |
| `GET` | `/api/live/carbon` | **Public.** Current + next-24h GB carbon intensity |
| `GET` | `/api/live/snapshot?…` | **Public.** Tariff + carbon + shift plan in one call |


`GET /api/health` now also reports `analysis: "llm" | "rules-only"`, which is the
quickest way to confirm enrichment is switched on.

---

## 9. Immediate next actions

If you do nothing else this week:

1. Turn off `AUTO_PROVISION` for production.
2. Set the calendar reminders for the three cap announcements above.
3. Deploy with Clerk keys and verify `GET /api/health` → `auth: clerk`.
4. Add **back-billing detection** first — a three-month dispute window is the
   strongest hook the product has, and it is a few lines in `analysis.ts`.

---

## 10. The live data layer (real-time prices and carbon)

Section 2 listed "published reference data" as Layer 1. The live layer is the
first *moving* part of it: instead of transcribing a table, it fetches the market
as it stands.

| Provider | Endpoint | Key? | What it gives |
| --- | --- | --- | --- |
| Octopus Energy | `api.octopus.energy/v1` | **None** | Half-hourly Agile Octopus unit rates + standing charge, per distribution region A–P |
| NESO | `api.carbonintensity.org.uk` | **None** | Current + forecast gCO2/kWh for GB |

**Why Octopus Agile and not "the customer's tariff".** There is no public API for
a customer's own bill (section 2, Layer 2 — that is consent-gated at the
supplier). Agile is the best available *reference*: a real, published,
half-hourly wholesale-linked price for the customer's exact region, so EnerOS can
price a shift and draw a real curve today. Where the customer is genuinely on
Agile, it is exact.

**The region join.** Octopus's A–P letters are the *same 14 areas* as Ofgem's
price-cap regions. `server/src/lib/live/regions.ts` holds that mapping, so a site
that has already resolved a cap region from its postcode
(`regionForPostcode`) gets the right live price with no extra lookup.

**Where the decisions live.** `server/src/lib/live/derive.ts` is pure and
I/O-free: `rateAt`, `priceStats`, `cheapestWindows`, `priciestWindows`,
`planShift`, `curveCost`. The providers fetch; the derivations decide. This keeps
the same "engine decides, LLM explains" rule the bill auditor follows, and it is
what `verify:live` tests offline.

**Flexibility is now arithmetic, not a promise.** `planShift(rates, kwh, hours)`
finds the priciest and cheapest contiguous windows and returns the £ saved per
cycle and per 30-day month. That is the number behind "charge the EV fleet
01:00–04:00 — £420/month", computed from the live curve rather than assumed.

**Degradation.** Every provider returns `LiveResult<T>` (`ok: true | false`) and
never throws. With no network the endpoints return a clear `503`, `GET
/api/health` still reports healthy, and the deterministic engine is unaffected.

**Keep it fresh.** The in-process cache holds a curve for `LIVE_CACHE_TTL_MS`
(15 min default) — prices only change per half hour. `AGILE_PRODUCT` is the one
value to bump when Octopus retires `AGILE-24-10-01`; discovery is not automated
because the product list is large and the code is stable for years at a time.

**Next step for this layer.** The natural follow-on is to persist each site's
actual half-hourly consumption (Phase 3) and *replay* the live curve against it,
turning the shift plan from "here is what you could save" into "here is what you
did save" — the verified-savings methodology the plan calls the key KPI.

```