# EnerOS — Status (Phase 0 audit)

> **Scope.** Phase 0 of `UPDATE_PROMPT.md`: run every existing check, map what is built, map
> what each screen is wired to, confirm or correct defects D1–D9. No feature code written.
>
> **Base.** `95a1290` (merge of PR #20), audited on `cline/design-contrast` at `d1fa665`,
> Node 24.22.2, Python 3.11.2, 7 Nov 2026.
>
> **Honesty rule.** Anything not executed is marked **unverified**; anything that could not be
> executed here is **blocked**, with the reason.

---

## 1. Checks — passed, failed, blocked

| # | Check | Command | Result | Evidence / note |
| --- | --- | --- | --- | --- |
| 1 | Root typecheck | `npx tsc --noEmit` | **PASS** | exit 0 |
| 2 | Server typecheck | `cd server && npx tsc --noEmit` | **PASS** | exit 0 |
| 3 | Theme guard (current rules) | `npm run verify:theme` | **PASS** 20/20 | monochrome, flat cards, no `font-mono`, 3 surface guards |
| 4 | Production build | `npm run build` | **PASS** | 27 routes generated |
| 5 | Lint | `npm run lint` | **FAIL** | `next lint` was removed in Next 16 and there is no ESLint config; the script resolves a directory called `lint`. The repo has **no working linter** |
| 6 | API smoke | `cd server && npm run smoke` | **PASS** 24/24 | auth, workspace, audit, recovery, action progression |
| 7 | Analysis engine | `verify:analysis` | **PASS** | deterministic checks + cap table |
| 8 | Billing/Stripe | `verify:billing` | **FAIL 17/18** | the *test* is stale, not the code: it asserts a `/plans` redirect while the code correctly returns `/onboarding/payment-status` (`verify-billing.ts:63`) |
| 9 | Safety policy | `verify:safety` | **PASS** | comfort / food-safety bounds |
| 10 | Ingest | `verify:ingest` | **PASS** | |
| 11 | Intake | `verify:intake` | **PASS** | |
| 12 | PDF extraction | `verify:pdfjs` | **PASS** | |
| 13 | Subscription journey | `verify:subscription` | **PASS** 73/73 | incl. 8 parallel site adds on a 3-site cap → exactly 3 |
| 14 | Live market | `verify:live` | **PASS** 33/33 | offline derivations; `--net` not run |
| 15 | Copilot | `verify:copilot` | **PASS** 22/22 | degrades to `unavailable` without a key |
| 16 | Gemini client | `verify:gemini` | **PASS** 19/19 | no live call (no key) |
| 17 | Connector proxy | `verify:connector` | **BLOCKED** | needs the FastAPI service; see #19 |
| 18 | Backend tests | `cd backend && pytest` | **BLOCKED** | `pip install -r requirements.txt` fails — **PyPI is unreachable from this sandbox** (`No matching distribution found for fastapi`) |
| 19 | Connector runtime | `uvicorn` on :8000 | **BLOCKED** | same missing dependencies |
| 20 | Browser journey | — | **NOT IN REPO** | no Playwright suite exists. An ad-hoc harness ran earlier PRs (funnel 34/34, dashboard 9/9, contrast sweeps) but none of it is committed, so it cannot gate work |
| 21 | Mobile | `cd mobile && tsc` | **NOT RUN** | no `node_modules` in `mobile/`; installing Expo deps is out of Phase 0 scope |

**Net:** the engine, commercial layer and deterministic checks are healthy. The gaps are
**process** (no linter, no committed E2E, one stale assertion) and **environment** (the
Python side cannot be exercised here).

---

## 2. Feature matrix

**DONE** = implemented and covered by a check I ran · **PARTIAL** = implemented with a known
    gap · **MISSING** = not in the repo.

| Capability | State | Evidence |
| --- | --- | --- |
| Public bill check (no account) | DONE | `src/app/start`, `views/start/*`, `routes/public.ts` (`/bill-check`, `/bill-check/file`, `/bill-check/meta`) |
| Onboarding (site → sites → devices → done) | DONE | `views/onboarding/*`, `routes/account.ts` |
| Plans, caps, subscription gate | DONE | `services/plans.ts`, `middleware/subscription.ts`, `routes/subscription.ts` |
| Stripe checkout + webhook | DONE | `routes/billing.ts`, `lib/billing/stripe.ts` (signature, amount, replay ledger) |
| Console dashboard (4 tabs) | PARTIAL | `views/Dashboard.tsx`, `components/dashboard/*` — D1, D2, D8 |
| Savings / approvals | DONE | `components/dashboard/SavingsPanel.tsx`; duplicate concept at `views/Optimiser.tsx` (D6) |
| Bill audit + findings | DONE | `views/Bills.tsx`, `views/Analysis.tsx`, `lib/analysis.ts` |
| Sites CRUD within plan cap | DONE | `views/Sites.tsx`, `routes/workspace.ts` (atomic reservation) |
| Meter data import + analysis | DONE | `views/Data.tsx`, `routes/consumption.ts`, `lib/consumption/*` |
| Live market (Agile, carbon) | DONE | `views/Live.tsx`, `lib/live/*` |
| Copilot (grounded) | DONE | `views/Copilot.tsx`, `routes/copilot.ts`, `lib/copilot.ts` |
| Device layer (Octopus/Solis, hardware, pause) | DONE backend / unverified here | `backend/app/*`, `components/settings/*`, `lib/connector.ts` |
| Mobile app | PARTIAL | `mobile/src/*` mirrors web; no subscription screens |
| Evidence model `{value, state, evidence}` | MISSING | every £ is a bare number |
| `/methodology`, `/terms`, `/privacy` | MISSING | footer links only |
| Email (receipt, dunning, digest) | MISSING | no provider in code |
| Sentry / request ids | MISSING | `console.error` only |
| Account export / delete | MISSING | no endpoints |
| Redis rate limit / AI ceiling | MISSING | module-level `Map` in `public.ts` |
| MultiFernet rotation | MISSING | single key in `backend/app/crypto.py` |
| Renewal cron, dunning, invoice PDFs, team roles, email-forward bills | MISSING | — |
| Playwright suite / CI | MISSING | — |

---

## 3. Wiring matrix

“Real vs seed”: **real** = derived from documents the customer created; **seed** = the demo
workspace inserted by `provisionWorkspace`.

### 3.1 Dashboard widgets

| Widget | Data | API | Real vs seed | Loading | Empty | Error | Deep-link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PlanPulse — verified £ | `monthExpected − monthActual` | `/api/workspace` | real (seed in demo) | console splash | no (shows 0) | no | no |
| PlanPulse — identified / awaiting / automated | `actions`, `invoices` | `/api/workspace` | real | splash | no | no | yes → Savings tab |
| PlanPulse — data confidence | `sites[].dataQuality` | `/api/workspace` | real (seed sets it) | splash | shows 0% | no | yes → `/data` |
| PlanPulse — pause/resume | `account.controlMode` | `PUT /api/workspace/control-mode` | real | optimistic | n/a | toast | n/a |
| Overview KPIs (4 tiles) | store metrics | `/api/workspace` | real | splash | no | no | **no** |
| Overview chart | `monthly[]` | `/api/workspace` | real | splash | no | no | no |
| Overview asset mix | `assetMix[]` | `/api/workspace` | seed-shaped | splash | no | no | no |
| Overview top sites | `sites[]` | `/api/workspace` | real | splash | no | no | **no** |
| Overview findings | `invoices[].issues` | `/api/workspace` | real | splash | no | no | **no** |
| NextBestActions | derived | `/api/workspace` | real | splash | yes | no | yes |
| Savings — opportunities | `actions` | `/api/workspace`, `POST /api/actions/:id/advance` | real | splash | yes | toast | n/a |
| Savings — challenges | `invoices` | `POST /api/invoices/:id/recover` | real | splash | yes | toast | n/a |
| Devices | connector | `GET /api/connector/v1/homes/:id/devices` | real; offline state implemented | yes | yes | yes (banner) | yes → `/settings` |
| Data — coverage | `sites[].dataQuality` | `/api/workspace` | real | splash | no | no | yes |
| Subscription card | subscription | `GET /api/subscription/status` | real | yes | no | no | yes |

**Systemic gap:** one splash for the whole workspace means no per-widget skeletons, six of the
fifteen widgets have no empty state, and only two have an error state.

### 3.2 Console screens

| Screen | Route | API | Real vs seed | Empty | Error | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Savings | `/optimiser` | `/api/workspace`, `/api/actions/*` | real | no | no | duplicates the dashboard Savings tab (D6) |
| Invoices | `/bills` | `/api/invoices`, `/api/uploads`, `/api/analysis/file` | real | yes (3) | yes | placeholder “Feb 2026” (D5) |
| Smart Analysis | `/analysis` | `/api/analysis/*` | real | yes (2) | yes | **1,118 lines** (D7) |
| Sites | `/sites` | `/api/workspace/sites` | real | no | yes | **629 lines** (D7) |
| Meter data | `/data` | `/api/consumption/*` | real | no | yes | hardcoded 2026-01-05 (D5) |
| Live market | `/live` | `/api/live/*` | real, public | no | yes | live dot not tied to data freshness |
| Copilot | `/copilot` | `/api/copilot/*` | real + LLM | no | no | no spend ceiling |
| Subscription | `/subscription` | `/api/subscription/*` | real | no | yes | no export/delete |
| Settings | `/settings` | `/api/connector/*` | real (offline here) | no | yes | pause / rate / hardware wired |
| Aliases | `/dashboard/{sites,settings,subscription,billing}` | — | — | — | — | 4 redirect files (D9) |

---

## 4. Defects D1–D9 — confirmed or corrected

| # | Verdict | Evidence | Correction / note |
| --- | --- | --- | --- |
| D1 | **Confirmed** | `views/Dashboard.tsx:98` — `billing period Mar 2026` | must derive from the latest invoice period |
| D2 | **Confirmed** | `views/Dashboard.tsx:102` — “Savings measured, not estimated” | the product reports both; replace with a verified / estimated split |
| D3 | **Confirmed, wider than listed** | `Landing.tsx:53`, `Landing.tsx:175`, `BrandPanel.tsx:41,68`, `UploadBill.tsx:120`, `Layout.tsx:82`, `public.ts:127` all frame the audit as “against the Ofgem price cap” | the Ofgem cap is a **domestic** cap; a business contract can legitimately sit above it. The copy must say “domestic reference” or drop the framing for business-applicable checks |
| D4 | **Confirmed as designed** | `index.css`, `ui.tsx` tone ramp, `theme-check.tsx` CHROMATIC regex | severity, status and sentiment share one ink ramp, so “high” and “good” scan alike. Phase 2 work, not a bug |
| D5 | **Confirmed** | `start/BillForm.tsx:36-43` (2026-02 example), `Bills.tsx:185` (“Feb 2026”), `Data.tsx:40` (`Date.parse('2026-01-05')`) | derive from today |
| D6 | **Confirmed** | `components/Layout.tsx` NAV — 10 flat items; `Savings → /optimiser` vs the dashboard's Savings tab | one Savings concept; group the nav |
| D7 | **Confirmed** | `Analysis.tsx` 1,118 lines; `Sites.tsx` 629 lines | split under ~300 lines per component |
| D8 | **Confirmed** | `Dashboard.tsx` 303 lines; overview mixes subscription, setup and KPIs; 2 of 15 widgets deep-link | rebuild in Phase 3 |
| D9 | **Confirmed** | `src/app/(console)/dashboard/{sites,settings,subscription,billing}/page.tsx` | delete once nothing links to them |

**Corrections to the brief.**

1. **README drift is in the marketing copy, not the README.** The README already describes an
   energy manager; the *landing page* is what undersells it.
2. **`PRODUCTION_READINESS.md` is not “rev 1 with known errors”.** It is 622 lines with prices
   dated 7 Nov 2026 and matches the code then. It lacks the evidence model and the cap-claim
   correction; it should be revised, not discarded.
3. **One extra defect (D10):** `verify:billing` has a stale assertion, so the suite is red for a
   reason unrelated to production code. Fix in Phase 1.

---

## 5. README drift (code vs documentation)

| Claim | Reality |
| --- | --- |
| “Vite 8 / React Router” stack | the app is **Next.js 16 App Router**; that section is stale |
| Free bill check “against the Ofgem cap” | same D3 problem as the UI |
| Plans £49/£149/£249 per site/month | accurate, served from `services/plans.ts` |
| Live market, Copilot, Optimiser | accurate |
| Subscription / entitlement layer | covered in a later section, absent from the feature table |
| Production + commercial pack | `PRODUCTION_READINESS.md` referenced but not summarised |

---

## 6. What Phase 0 changes about the plan

1. **Lint is broken, not missing** — `npm run lint` fails for everyone. Fix with an ESLint flat
   config in Phase 2, or remove the script now; until then `npm run verify` cannot exist.
2. **One stale assertion** keeps `verify:billing` red — a five-minute fix that makes the suite
   green and trustworthy.
3. **The Playwright journey should land in Phase 1, not Phase 5.** Both regressions found in
   earlier rounds (white-on-white card, stale capacity counter) were caught only by an ad-hoc
   harness that lived outside the repo.
4. **Python is untestable here** — every backend claim stays unverified until someone runs it
   where PyPI is reachable. Say so in every status report.
5. **D3 is copy + methodology, not design** — it must land before Phase 2 so the new design does
   not ship the old claim.

---

## 7. Proposed Phase 1 (this is what I will do next)

1. Fix lint + the stale billing assertion (green suite).
2. **D1 / D5:** derive every date from “today” or the latest invoice period; add a test.
3. **D2:** replace the badge with a computed verified / estimated split.
4. **D3:** relabel the cap as a **domestic reference**, add `/methodology`, and reword the six
   cited locations.
5. **Evidence model:** API returns `{value, state, evidence}` for money; `EvidenceMark` + drawer
   on dashboard KPIs, savings rows and the bill-check result.

Everything above is additive and reversible; nothing in Phase 1 needs the Phase 2 design system.

---

## 8. Phase 1 — what landed (verified)

| Item | Change | Evidence |
| --- | --- | --- |
| D10 stale test | `verify-billing` now asserts `/onboarding/payment-status` **and** the cancel path carries `state=cancelled` | `npm run verify:billing` → **19/19** |
| D1 | Dashboard header derives the latest invoiced period instead of “Mar 2026” | `Dashboard.tsx`; browser check reads “latest bill…” and rejects the hardcoded string |
| D2 | “Savings measured, not estimated” removed; replaced by a **Verified / Estimated / Issue** legend, with the verified hero and an estimated line beneath it | `PlanPulse.tsx`, `Dashboard.tsx` |
| D5 | Worked example dates derive from the last complete month; invoice-period placeholder is the current month; meter-data sample starts 13 days ago | `BillForm.tsx` (`lastMonth()`), `Bills.tsx`, `Data.tsx`; browser check confirms `2026-10-01 → 2026-10-31` |
| D3 | The cap is now described as a **published domestic reference** in Landing (hero + feature), BrandPanel, UploadBill, Layout subtitle, the audit note, the audit chip, onboarding, Analysis and `public.ts`; new **`/methodology`** page linked from the footer and the audit result | browser checks: no “against the Ofgem price cap” on the landing page, `/methodology` renders, audit links to it |
| Evidence model (client) | New `EvidenceMark` + `Money`: dot beside every £, `<details>` drawer showing inputs, arithmetic and source. Applied to the verified hero, the estimated total, every opportunity and every bill finding, and the audit saving | 7 marks on the dashboard; clicking one opens “Baseline £91,600 · Actual £81,420 · Source: your invoices” |

**Still to do in Phase 1 (not claimed as done):** the evidence model is derived in the
UI from provenance we already know. `UPDATE_PROMPT.md` asks the **API** to return
`{value, state, evidence}` — that is a server change and is the first item of the next pass,
so a client can never mislabel a figure.

**Phase 1 check results:** `verify:theme` 20/20 · `smoke` 24/24 · `verify:billing` 19/19 ·
`next build` clean · browser Phase 1 run **14/14**.
