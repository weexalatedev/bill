# UPDATE_PROMPT — audit, design direction and build plan

> This file is the brief the work is measured against. It arrived as a review of
> `weexalatedev/bill` at `95a1290` (merge of PR #20, 7 Nov 2026) and is stored here so
> every phase can reference a real path instead of a pasted document.
>
> Companion files: `docs/STATUS.md` (Phase 0 output), `design/eneros-tokens.css`
> (Phase 2 tokens).

## 1. Diff — plan vs code

### Built
Public bill-check funnel; onboarding; plans/caps/subscription gate/Stripe; console with
Dashboard (4 tabs), Savings, Invoices, Smart Analysis, Sites, Meter data, Live market,
Copilot, Subscription, Settings; device layer (Solis connector, hardware, smart control,
pause); live market (Agile, carbon, weather); Expo mobile app; verify scripts.

### Missing (confirmed by search)
Upstash/Redis rate limit (module-level `Map` in `public.ts`); Resend email; Sentry;
`GET /api/account/export` and `DELETE /api/account`; `/terms` and `/privacy` pages;
MultiFernet rotation; invoice PDFs, team roles, email-forward bills, renewal cron;
Playwright suite / CI.

### Defects

| # | Where | Problem |
| --- | --- | --- |
| D1 | `Dashboard.tsx:98` | hardcoded “billing period Mar 2026” |
| D2 | `Dashboard.tsx:102` | “Savings measured, not estimated” contradicts the product |
| D3 | Landing, BrandPanel, UploadBill, Layout, AuthShell, `public.ts`, `priceCap.ts` | business bills framed as audited “against the Ofgem price cap”, which is a domestic cap |
| D4 | `index.css`, `ui.tsx`, `theme-check.tsx` | monochrome ramp makes severity indistinguishable; uppercase tracked kickers; flat cards |
| D5 | `BillForm.tsx:38`, `Bills.tsx:185`, `Data.tsx:40` | stale hardcoded dates |
| D6 | `Layout.tsx` nav | ten flat items; “Savings” collides with the dashboard tab; Invoices/Analysis overlap |
| D7 | `Analysis.tsx` 1,118 lines, `Sites.tsx` 629 | oversized views |
| D8 | `Dashboard.tsx` | mis-indented overview mixing subscription/setup/KPIs; deep-links unconfirmed |
| D9 | `(console)/dashboard/{sites,subscription,settings}` | redirect aliases clutter the tree |

## 2. UX journey audit (summary)

Discover → bill check → sign-up → onboarding → pay → dashboard → site/bills/analysis →
live/devices → copilot → account → retain.
Gaps: claim D3, benchmark validity, stale defaults, failed/expired payment states, no
verified/estimated split, non-scannable severity, no digest email, no export/delete.

## 3. Design direction

Product: EnerOS audits UK business electricity bills and manages their sites so owners can
see and recover verified savings. Character: exact, calm, quietly alive. World: meters,
switchgear, copper conductor — graphite panels, one warm metal, a green status lamp.

- **Moments** (one or two per screen): (1) savings hero card, deep bottle-green gradient with
  copper light; (2) spend/baseline chart with a copper area fill that draws in; (3) landing
  hero scene with the live product view rising from the bottom edge.
- **Signature:** the **evidence mark** — a dot beside every £ figure. Filled green = verified,
  hollow amber = estimated, hollow red = issue.
- Neutral surfaces stay neutral; one accent (copper); colour only for meaning; every pair
  ≥ 4.5:1. Gradients only on moment surfaces and chart fills, never on buttons, borders, text
  or page backgrounds. Liveliness is functional (breathing dot only where data is live, one
  staggered entrance, number tweens, chart draw-in, skeletons, ≤2px hover lift), all off under
  `prefers-reduced-motion`. Remove uppercase tracked kickers; sentence case + mono for meta.

### Component rules

| Component | Change |
| --- | --- |
| `Badge` | tones `neutral, verified, estimated, issue, accent`; keep `solid` for counts only |
| `StatCard` | label, big figure (mono, tabular), change vs comparison, evidence mark; no icons/sparklines |
| `MomentCard` (new) | wraps `.eos-moment`; one per screen |
| `EvidenceMark` (new) | `state: verified \| estimated \| issue`; tooltip opens the evidence drawer |
| `Money` (new) | one £ format, tweened change |
| `Skeleton`, `EmptyState`, `ErrorState` | required on every data widget |
| Charts | one accent per chart; the main chart is the largest thing on screen |

## 4. Plan

| Phase | Goal | Exit check |
| --- | --- | --- |
| 0 | Inventory, run all tests, wiring matrix | `docs/STATUS.md` reviewed |
| 1 | Trust and correctness: D1–D3, D5, evidence labels, valid benchmark | no stale dates; every £ labelled; no cap claim without a valid basis |
| 2 | Design system v2 and shell | tokens in, `ui.tsx` updated, `verify:theme` rewritten, nav regrouped |
| 3 | Screens, one at a time, wired to real data | each screen has loading, empty, error, deep-links |
| 4 | Operate: payments safe, email, Sentry, export/delete, legal | README §2.4 gate passes |
| 5 | Quality: Playwright journey, CI, screenshots | `npm run verify` green |

## 5. The build prompt (canonical)

> You are the lead engineer and designer on EnerOS (Next.js 16 in `/src`, Express API in
> `/server`, FastAPI connector in `/backend`, Expo app in `/mobile`). Read `README.md` and
> `PRODUCTION_READINESS.md`, then `design/eneros-tokens.css` and this file's sections 1–4.
> Work on a branch with small commits. Never claim something works unless you ran it.
>
> **Phase 0 — inventory (no feature code).** Run every existing check; write `docs/STATUS.md`
> with a feature matrix, a wiring matrix for every dashboard widget and console screen (API
> route, model, real vs seed, loading/empty/error, deep-links), and code↔README drift; confirm
> or correct D1–D9; stop for approval.
>
> **Phase 1 — trust and correctness.** Fix D1, D5 (derive dates), D2 (verified/estimated
> split), D3 (cap is domestic; introduce business-applicable checks, add `/methodology`),
> and introduce an evidence model: every money figure returns
> `{value, state: verified|estimated|issue, evidence: {inputs, arithmetic, source}}`, rendered
> with `EvidenceMark` and a drawer.
>
> **Phase 2 — design system v2.** Merge the tokens; load Geist + Geist Mono; rewrite `ui.tsx`
> to the component rules; rewrite `verify:theme` to enforce the new rules; regroup the sidebar
> (Overview, Savings, Money, Operations, Copilot, Account); remove `/dashboard/*` aliases;
> add the motion contract.
>
> **Phase 3 — screens, one at a time.** Dashboard, Savings, Invoices (+Analysis), Sites,
> Devices, Live market, Meter data, Copilot, Account, public pages. Loading, empty, error,
> deep-links, 375/768/1280.
>
> **Phase 4 — operate.** Redis rate limit + AI ceiling; upload hardening; boot assertions;
> MultiFernet rotation; billing states + grace; Resend emails; Sentry; export/delete; real
> `/terms` and `/privacy`.
>
> **Phase 5 — quality.** Playwright journey in CI; `npm run verify`; screenshots at three
> widths; README rev 2; remove the handover zip and `business_plan.txt` from the repo.
>
> **Rules.** Do not invent data or claims. “Verified” only when the evidence drawer can show
> the calculation. No gradient on buttons, borders, text or page backgrounds. No emoji, no
> exclamation marks. One number format, tabular figures, 4px grid. No dependency without a
> one-line reason. No secrets. After each phase: run `npm run verify`, update `docs/STATUS.md`,
> summarise and wait for approval.

## 6. Acceptance checklist

- [ ] No hardcoded dates; defaults follow today
- [ ] Every £ has an evidence mark and a drawer
- [ ] No claim of auditing business bills against the domestic cap
- [ ] One accent; meaning colours only for meaning; gradients only on moments and chart fills
- [ ] Every screen: skeleton, empty, error, deep-links, three breakpoints
- [ ] Live dot only when data is live; reduced motion respected
- [ ] Rewritten `verify:theme` fails on violations
- [ ] README §2.4 go/no-go gate passes
- [ ] `npm run verify` green in CI
