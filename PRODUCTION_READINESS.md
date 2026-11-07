# EnerOS — Production Readiness, Commercial Plan & Viability Study

> **What this file is.** The document you hand to an engineer, an accountant and an
> investor. Part A is the go-live checklist; Parts B–I are the money: tool costs with
> live prices, a minimum-viable budget, a financial model by scale, adoption research,
> competitors, a hardware option, marketing and viability.
>
> **Pricing provenance.** Every vendor price below was fetched from the vendor's own
> page on **7 November 2026** and converted at **£1 = $1.3385** (Frankfurter, 6 Nov
> 2026). Prices change; re-check the links in the appendix before signing an annual
> contract. Anything marked **[assumption]** is a planning input, not a quote, and has
> an owner to validate it in Part J.
>
> **Current state (measured, not promised).** `main` ships one seeded demo workspace
> (12 sites, £81,420/yr spend) and **zero paying customers**. The product, funnel and
> subscription enforcement are built and tested (73 backend + 34 browser checks); what
> is missing is everything in Part A that turns a working app into an operated business.

---

## Contents

| Part | What it answers |
| --- | --- |
| **A** | Production checklist — what must be true before the first paying customer |
| **B** | The stack, with live prices, and what each tier costs |
| **C** | Minimum viable budget — one-off and monthly |
| **D** | Financial model by scale (0 → 2,500 sites), break-even, unit economics |
| **E** | Adoption research — who buys, why, and how we will find out |
| **F** | Competitor analysis (companies verified live today) |
| **G** | A hardware business you can start alongside the software |
| **H** | Marketing plan |
| **I** | Viability study — market size, scenarios, risks, recommendation |
| **J** | Decisions needed, with owners |

---

# Part A — Production checklist

Ordered by “would this stop you taking money?”. A1 is the go/no-go gate.

## A1. Blockers before the first paying customer

| # | Item | Why it blocks | What to do |
| --- | --- | --- | --- |
| 1 | **Clerk configured in production** | Dev auth mints a token for any email off a shared secret; it must not be the production identity provider. | Set `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`. `/api/auth/register` already returns 400 in Clerk mode, so dev sign-up closes itself. |
| 2 | **Stripe live keys + webhook endpoint** | Without them every subscription is a labelled *test-mode* payment. | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL`; register `https://<host>/api/billing/webhook` for `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `customer.subscription.updated/deleted`. |
| 3 | **Production MongoDB with backups** | The default local mode is in-memory Mongo: every bill dies on restart. | Atlas M10+ (dedicated), daily snapshots **plus** point-in-time recovery, IP access list, separate `eneros-prod` database. Restore it once, on purpose. |
| 4 | **Secrets management** | `.env` in a repo or a chat message is how breaches happen. | Vercel + API-host environment variables; rotate `DEV_AUTH_SECRET`, `ENCRYPTION_KEY` (Fernet, encrypts supplier credentials), `APP_API_TOKEN`, Stripe keys. Write the rotation down. |
| 5 | **Rate limiting that survives scale-out** | `server/src/routes/public.ts` keeps its hit counter in a module-level `Map`: per-instance, reset on deploy, so the free bill check can be farmed for AI spend. | Move the counter to Upstash Redis (or Cloudflare rate limiting) keyed by IP + route, with a daily AI-spend ceiling. |
| 6 | **AI spend guard** | `GEMINI_API_KEY` behind a public endpoint is an open wallet. | Per-IP/day cap, timeout, upload limits (already 2 MB), and an alert when daily tokens exceed budget. |
| 7 | **Transactional email** | There is no mail provider in the codebase: no receipts, no dunning, no renewal reminders, no invoice-forward address. | Resend + templates: receipt, payment failed, renewal in 3 days, weekly saving digest. |
| 8 | **VAT decision** | Registration is compulsory once turnover passes **£90,000** in any rolling 12 months (gov.uk, checked 7 Nov 2026). At the modelled £97/site/month that is ≈ **77 sites**. | Register as you approach it (or voluntarily earlier to reclaim input VAT). Invoice templates must show VAT separately — the order summary already computes it. |
| 9 | **Legal pack** | Selling to businesses still needs T&Cs, privacy notice, DPA for subprocessors, and a clear statement that EnerOS is **not** an energy supplier or broker. | One-off solicitor review (Part C). Publish `/terms` and `/privacy`; both are placeholder links in the footer today. |
| 10 | **ICO registration + DPIA** | You process MPANs, consumption, postcodes and supplier credentials. | ICO tier-1 micro-organisation fee **£52/yr** (confirm at ico.org.uk — the page blocked automated checks), records of processing, DPIA, published subprocessor list (Vercel, Atlas, Clerk, Stripe, Google, Cloudflare). |
| 11 | **Data export and deletion** | UK GDPR requests must be met within 30 days; neither endpoint exists. | `GET /api/account/export` (JSON of sites, invoices, consumption, payments) and `DELETE /api/account` (soft-delete, 30-day purge) with an audit trail. |
| 12 | **Dunning and failed payments** | `payment_intent.payment_failed` marks the account failed, but nothing retries or warns. | Retry on day 1/3/7, in-app banner, email, then a grace period. Recommended policy: **7 days grace, then read-only**, data preserved. |
| 13 | **Renewal clock** | Expiry is evaluated on read (`resolveSubscription`), which is correct but useless for “renews in 3 days” emails. | Daily cron (Vercel Cron or a worker): lapse expired periods, email reminders, raise the invoice. |
| 14 | **Observability and on-call** | Today: `console.error`. | Sentry (web + API), structured logs with request ids, uptime checks on `/api/health` and `/api/plans`, a status page, and one named person who gets paged. |
| 15 | **Backup/restore + incident runbook** | You need it at 2am, not in the abstract. | One page: roll back a deploy, pause billing, rotate keys, restore Mongo, contact Stripe. |

## A2. First 90 days after launch

| Area | Item | Notes |
| --- | --- | --- |
| Security | Security headers + CSP, Dependabot, `npm audit` in CI | Next.js config headers; no inline scripts beyond Clerk. |
| Security | Penetration test or scoped bug bounty | £2,500–£6,000 **[assumption]**; before enterprise deals, not before launch. |
| Reliability | Playwright funnel test in CI on every PR | The script already exists; it caught two real bugs during this build. |
| Reliability | Persistent queue for webhooks and AI jobs | Stripe retries, but your handler must survive a cold start; `WebhookEvent` already makes replay safe. |
| Billing | Invoice PDFs, credit notes, refunds, SCA/3-DS | Stripe Invoicing, or a renderer you own. |
| Product | **Email-forward address** (`bills+<site>@…`) | The lowest-friction acquisition feature in the plan. |
| Product | Half-hourly import at volume | 48 docs/day/site adds up fast: index, batch-insert, retention. |
| Product | Team members and roles | Not in the README; needed the first time a finance person asks. |
| Compliance | Retention (bills 6 years for HMRC), PII minimisation, subprocessors published | Goes in the privacy notice. |
| Support | Helpdesk + published SLA (“first reply within one business day”) | Freshdesk/Help Scout free tiers suffice at launch. |
| Accessibility | WCAG 2.2 AA audit of the funnel | Public-sector and large-SME procurement ask. |
| Finance | Monthly close: Stripe payouts reconciled to the `Payment` collection | Export both to the accountant; quarterly VAT return. |

## A3. Deliberately deferred (and why)

- **SOC 2 / ISO 27001** — £15k+ **[assumption]**; only when a prospect makes it a condition.
- **Mobile subscription screens** — the app inherits the API gate (402) and works for the demo account; non-paying mobile users need a deep link into the web funnel.
- **Per-plan feature gating** — the README defines no feature restrictions, so entitlement is binary (active/inactive). Build it when a plan actually withholds something.
- **Multi-region / HA** — a single region with tested backups is honest below ~1,000 sites.
- **Bring-your-own Stripe / on-prem** — no demand evidence yet.

## A4. Go/no-go gate

Ship to the first paying customer only when **all** of these are true:

1. Clerk keys live; dev registration returns 400 in production.
2. A £1 live charge has been made and refunded end-to-end, with the live webhook signature verified.
3. A restore from backup was performed by someone who did not set backups up.
4. `/terms`, `/privacy` and the DPA are published; the ICO fee is paid.
5. Export and delete endpoints exist and have been exercised on the demo workspace.
6. Sentry receives a forced error from both web and API, and the alert reaches a phone.
7. The 34-check browser funnel passes against production, not localhost.

---

# Part B — The stack, with live prices

## B1. What you already run (and what it would cost you to run it properly)

| Layer | Tool in this repo | Live price (7 Nov 2026) | Minimum production choice |
| --- | --- | --- | --- |
| Web + edge | **Vercel** (Next.js 16) | Pro **$20/mo** ≈ **£15**; usage billed on top (bandwidth, function GB-hours) | Pro (Hobby forbids commercial use) |
| API | **Node/Express** (same repo, `/api`) | Same Vercel Pro plan if deployed as a function; otherwise a small VM | Vercel, until Mongo connection pooling forces a split |
| Database | **MongoDB** | Free 512 MB • **Flex $0.011/hr (capped $30/mo)** • **Dedicated from $56.94/mo** (£42.5) | Flex at launch, Dedicated (M10) at ~50 sites |
| Auth | **Clerk** | Hobby free • **Pro $20/mo billed annually**, 50k MRU included, **$0.02/mo** per extra MRU • Business $250/mo | Pro from day one (you need the SLA and seats) |
| Payments | **Stripe** (already integrated) | **1.5% + 20p** standard UK cards, **2.5% + 20p** EU cards, **2.8% + 20p** premium UK, 0.5% on currency conversion; +20% VAT on fees | Pay-as-you-go, no fixed fee |
| Files | **Cloudflare R2** | **$0.015/GB-month** storage, **$0.36/million** Class B ops, **egress free** | R2 (cheaper than S3 for read-heavy PDFs) |
| AI | **Gemini API** (bill extraction + Copilot) | Gemini 2.5 Pro **$1.25/1M input, $10/1M output**; Flash-class introductory **$0.75/$3.75 per 1M** through 31 Dec 2026, then $1.5/$7.5 | Flash for extraction/narration, Pro only where it earns its keep |
| Connector | **Python FastAPI** (`backend/`) | Fly.io/Railway small shared VM **≈$5–7/mo** (£4–5) **[from listed plan pages, verify region]** | One shared-cpu VM |
| Cache / limits | not yet used | **Upstash Redis $0.20 per 100k commands** | Add before scale-out |
| Email | none yet | **Resend** Free 3,000/mo (100/day) • **Pro $20/mo** for 50,000/mo, **$0.90 per extra 1,000** | Free tier until receipts matter |
| Errors | none yet | **Sentry** Team **$26/mo** (£19) • Business $80/mo | Team |
| Product analytics | none yet | **PostHog** free tier, usage-based after (see posthog.com/pricing) | Free tier + funnels |
| Source control / CI | GitHub | **Team $4/user/mo** (£3) | Team |
| Reviews, docs | — | GitHub Projects/Issues included | — |

## B2. Tools you still need to operate (not in the repo)

| Need | Tool | Live price | When |
| --- | --- | --- | --- |
| Helpdesk | Freshdesk / Help Scout | Free tiers; paid from ~£12–20/agent/mo | At first customer |
| Uptime + status page | Better Stack / Checkly | Free tier; paid from ~£20/mo | At launch |
| Accounting | Xero / FreeAgent | ~£16–£40/mo **[listed range]** | At incorporation |
| Companies House | incorporation | **£50** one-off (gov.uk fees, checked) | Before trading |
| ICO data protection fee | ICO | **£52/yr** tier 1 (verify) | Before processing live data |
| Legal templates | solicitor | £750–£1,500 one-off **[assumption]** | Before launch |
| Insurance | PI + cyber | £300–£600/yr **[assumption]** | Before first contract |
| Design | existing monochrome system | £0 | — |
| Analytics consent | cookieless PostHog, or a CMP | £0–£10/mo | If you add marketing cookies |

## B3. What the bill looks like at four sizes

Monthly, GBP, excluding staff (staff is in Part D).

| Line | 0 sites | 25 sites | 100 sites | 1,000 sites |
| --- | --- | --- | --- | --- |
| Vercel Pro + usage | 15 | 20 | 60 | 250 |
| MongoDB | 0 (free) | 22 (Flex) | 43 (M10) | 250 (M30–M40) |
| Clerk | 0 (Hobby) | 15 | 15 | 60 |
| Stripe fees | 0 | ~41 (1.7% of £2,425) | ~165 (1.7% of £9,700) | ~1,650 (1.7% of £97,000) |
| Cloudflare R2 | 1 | 2 | 5 | 40 |
| Gemini | 5 | 15 | 60 | 600 |
| Resend | 0 | 0 | 15 | 90 |
| Sentry | 0 | 19 | 19 | 60 |
| PostHog | 0 | 0 | 20 | 150 |
| Upstash | 0 | 1 | 5 | 40 |
| Python connector host | 5 | 5 | 12 | 40 |
| GitHub Team | 3 | 3 | 12 | 24 |
| Status page / helpdesk | 0 | 0 | 20 | 80 |
| **Total infrastructure + payment fees** | **≈29** | **≈143** | **≈451** | **≈3,334** |
| As % of revenue | n/a | 5.9% | 4.6% | 3.4% |

Two things fall out of that table and drive Part D:

1. **Infrastructure is not the constraint; support is.** At 1,000 sites infra+fees are ~3.4% of revenue. The cost that scales with customers is a human answering “why is my February bill flagged?”.
2. **Stripe is the largest variable line** — 1.7% effective on a £97 average site. Moving customers to Direct Debit (GoCardless ~1% capped £2) or card-on-file with lower rates is a later lever, not an early one.

---

# Part C — Minimum viable budget

## C1. One-off, to be trading legally

| Item | Lean (do it yourself) | Sensible | Notes |
| --- | --- | --- | --- |
| Company formation (Companies House) | £50 | £50 | £50 online, checked 7 Nov 2026 |
| ICO data protection fee | £52 | £52 | Tier 1 micro-organisation |
| Legal: T&Cs, privacy, DPA, subprocessor list | £0 (templates, self-written) | £900 | One solicitor review beats a subscription generator for B2B |
| Accountant setup (VAT, payroll, first return) | £150 | £450 | Monthly thereafter |
| Domain + email | £25 | £60 | `.co.uk` + Google Workspace or Fastmail |
| Insurance: PI + cyber | £0 (defer) | £350 | Some enterprise buyers require it |
| Penetration test | £0 (defer) | £2,500 | Defer until an enterprise asks or a breach scare happens |
| Brand/design | £0 | £0 | The monochrome system already exists |
| **Total** | **£277** | **£4,312** | |

## C2. Monthly, before revenue

| Item | £/month |
| --- | --- |
| Vercel Pro | 15 |
| MongoDB Flex (free tier is enough until you have paying sites) | 0–22 |
| Clerk Hobby → Pro | 0–15 |
| Stripe | 0 (usage) |
| Cloudflare R2 + domain amortised | 2 |
| Resend free tier | 0 |
| Sentry free / Team | 0–19 |
| Upstash | 1 |
| Connector VM | 5 |
| GitHub Team | 3 |
| Accounting | 50 |
| **Operating floor** | **≈76–132** |
| Marketing test budget (optional) | 300 |
| **Total** | **≈376–432** |

That is the honest number: **under £500 a month** to run the software for the first handful of customers. The expensive inputs are your time and customer acquisition, not infrastructure.

## C3. The bootstrap that pays for itself

Sell a **paid bill audit** before the subscription works for the customer:

- £250 one-off for a 12-month bill audit (upload or email 12 PDFs, deterministic checks, a written findings pack, challenge letters drafted).
- Deliverable is the same engine the product runs, so marginal cost is ~£2 of AI and 45 minutes of your time.
- 10 audits = £2,500 = the entire lean launch budget (Part C1) plus ~4 months of running costs.
- Every audit is a paying customer interview, a data source, and a case study. Convert to subscription at the end (the audit fee is credited against month one).

This is the recommended route: **services fund software until software funds itself.**

---

# Part D — Financial model by scale

## D1. The inputs (all visible, all changeable)

| Input | Value | Source / status |
| --- | --- | --- |
| Starter / Growth / Autonomous price | £49 / £149 / £249 per site per month | `server/src/services/plans.ts` (README) |
| Plan mix | 60% / 32% / 8% | **[assumption]** — validate against first 30 customers |
| Blended revenue per site | **£97.00/mo** | 0.60×49 + 0.32×149 + 0.08×249 |
| Sites per customer | 1.6 (year 1) → 2.2 (year 3) | **[assumption]** — hospitality groups, small chains |
| Revenue per customer | £155/mo (year 1) | derived |
| Payment fees | 1.7% of revenue | 1.5% + 20p on £97 average |
| Variable AI + storage | ≈£0.60 per site/mo | Gemini Flash pricing × ~15 documents/site/mo |
| Logo churn | 3%/mo early → 2%/mo at scale | **[assumption]** — SMB SaaS norms; measure from month 2 |
| Bill check → account | 25% | **[assumption]** |
| Account → paid | 35% | **[assumption]** — the gate forces a decision |
| Blended CAC | £120 founder-led → £250 referral → £450 paid | **[assumption]** |
| Founder draw | £0 during bootstrap, £3,000/mo from stage 3 | Decision, not a market rate |

## D2. Stage table (monthly, GBP)

Infrastructure here excludes payment fees and AI (they have their own rows), so the
columns add up to the gross profit line.

| | 0 launch | 20 sites | 50 sites | 100 sites | 250 sites | 500 sites | 1,000 sites | 2,500 sites |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customers (1.6 sites each) | 0 | 13 | 31 | 63 | 156 | 313 | 625 | 1,563 |
| MRR | 0 | 1,940 | 4,850 | 9,700 | 24,250 | 48,500 | 97,000 | 242,500 |
| Payment fees (1.7%) | 0 | 33 | 82 | 165 | 412 | 825 | 1,650 | 4,123 |
| Infrastructure (Part B3, ex-fees/AI) | 24 | 80 | 110 | 205 | 410 | 650 | 1,000 | 1,900 |
| AI + storage (~£0.60/site) | 0 | 12 | 30 | 60 | 150 | 300 | 600 | 1,500 |
| **Gross profit (before support)** | **−24** | **1,815** | **4,628** | **9,270** | **23,278** | **46,725** | **93,750** | **234,977** |
| Gross margin | — | 93.6% | 95.4% | 95.6% | 96.0% | 96.3% | 96.6% | 96.9% |
| Support / CS | 0 | 400 | 800 | 1,600 | 4,000 | 8,000 | 16,000 | 40,000 |
| Engineering | 0 | 0 | 0 | 0 | 5,500 | 11,000 | 22,000 | 55,000 |
| Sales | 0 | 0 | 0 | 0 | 0 | 0 | 8,000 | 20,000 |
| Founder draw | 0 | 0 | 0 | 3,000 | 3,000 | 3,000 | 3,000 | 3,000 |
| Tools + admin | 80 | 100 | 120 | 150 | 200 | 250 | 300 | 400 |
| Marketing | 300 | 500 | 750 | 1,000 | 2,000 | 3,500 | 5,000 | 12,000 |
| **Contribution / EBITDA** | **−404** | **+815** | **+2,958** | **+3,520** | **+8,578** | **+20,975** | **+39,450** | **+104,577** |

Read the bottom row carefully: **break-even is between 0 and 20 sites** on a founder-unpaid basis, and around **100 sites** once you pay yourself £3,000 and hire a first support person. That is the real milestone: not “we have users”, but “the business pays two salaries and still grows”.

## D3. Break-even arithmetic

- Contribution per site (before support) = £97 × (1 − 1.7%) − £0.60 = **£94.75**.
- Founder-unpaid fixed costs = infra £29 + tools £80 + marketing £300 = **£409/mo** → **4.3 sites** (~3 customers).
- With a £3,000 founder draw and one support hire (£4,000) = **£7,409/mo** → **78 sites** (~49 customers).
- With two engineers and three support (£25,000 loaded) = **£32,409/mo** → **342 sites** (~214 customers).

## D4. Unit economics

| Metric | Value | Working |
| --- | --- | --- |
| Contribution per customer / month | **£147** | £155 revenue − £2.60 fees − £5.60 support/AI allowance |
| CAC (founder-led) | £120 **[assumption]** | 6 hours of selling per customer at an opportunity cost of £20/h |
| CAC (referral via broker/accountant) | £250 **[assumption]** | 15% of year-one revenue as a referral fee |
| CAC (paid search) | £450 **[assumption]** | £4 CPC ÷ 1.5% visit→paid, tested before scaling |
| Payback | **0.8–3.1 months** | CAC ÷ £147 |
| LTV at 3% monthly churn | **£4,851** | 33.3 months × £147 |
| LTV at 5% monthly churn | **£2,940** | 20 months × £147 — churn is the number that decides this business |
| LTV : CAC | **19× → 6.5×** | Founder-led vs paid search |
| Net revenue retention | **target 105%** | Sites per customer growing 1.6 → 2.2 is the growth engine: land one site, earn the portfolio |

## D5. Cash and the ask

| Scenario | What it buys | Cash needed |
| --- | --- | --- |
| **Bootstrap** | Sell audits (Part C3), keep the founder unpaid, 50 sites in 9 months | **£6k–£10k** (one-off legal + 6 months of Part C2 + audit delivery costs) |
| **Seed-lite** | Founder at £3k/month from month 1, 250 sites in 18 months, one support hire | **£60k–£90k** |
| **Venture** | Two engineers, paid acquisition, 1,000 sites in 24 months | **£600k–£900k** |

The honest recommendation for this product at this stage is **bootstrap via audits, then a seed-lite round only after 50 paying sites prove retention**. Selling a dashboard before you have retention data is how energy SaaS companies die.

## D6. VAT and the £90k cliff

- Threshold: **£90,000** rolling 12-month turnover (gov.uk, 7 Nov 2026).
- At £97/site/month (£1,164/site/year), that is **≈77 sites** (≈48 customers).
- Effect: you must add 20% VAT to invoices. Most B2B customers reclaim it, so revenue is largely unaffected, but **cash** and **consumer-style** buyers feel it. Register voluntarily earlier only if your input VAT (Stripe fees, hosting, contractor invoices) exceeds your output VAT administration cost.
- Keep the order summary’s VAT line honest: it already computes 20% separately, which is exactly what an HMRC-compliant invoice needs.

---

# Part E — Adoption research

The question is not “will people like it”, it is **“who already spends money on this problem, and what do they do instead?”**

## E1. Segments, ranked by fit

| Segment | Why they fit | Typical sites | Buying trigger |
| --- | --- | --- | --- |
| Hospitality groups (5–25 venues) | High kWh/sqm, refrigeration 24/7, thin margins, one owner signs | 5–25 | A renewal quote, or one shocking winter bill |
| Small retail chains | Many small sites, single finance lead | 5–50 | Portfolio-wide cost pressure |
| Care homes | 24/7 operation, compliance-heavy, energy is top-3 cost | 1–10 | Budget season |
| Gyms / leisure | HVAC + hot water, off-peak opportunity | 1–10 | Price cap change |
| Food production / bakeries | Ovens + refrigeration, half-hourly data already present | 1–5 | Bill error found by a broker |
| Single-site cafés | Fit, but low willingness to pay and high churn | 1 | Only via the free bill check |

## E2. What they do today (the real competitor is a spreadsheet and a broker)

1. Pay the bill without reading it.
2. Ask a broker at renewal, who is paid by the supplier, not by them.
3. Believe “we switched last year, so we are fine”.
4. Watch the DD leave the account and treat the variance as weather.

EnerOS wins only if it answers **“how much, where, and can I prove it?”** faster than the broker does. That is why the funnel starts with the bill check: it produces a number in 90 seconds, before asking for trust.

## E3. Research plan (4 weeks, ~£0)

| Step | Method | Output |
| --- | --- | --- |
| 1 | 20 interviews (15 min) with owners/ops/finance in the segments above, recruited from audit customers and LinkedIn | Objection list ranked by frequency |
| 2 | 5 design partners: 3 months free in exchange for 12 months of bills + a monthly call | Retention signal and real HH data |
| 3 | Instrumentation: PostHog events on bill check start → finish → account → plan → pay | Funnel conversion truth (replaces the assumptions in D1) |
| 4 | Price test: show Starter first vs Growth first to alternating cohorts | Which plan the market actually picks (validates the 60/32/8 mix) |
| 5 | Win/loss on every lost deal, in writing | The objection you must build against next |

## E4. Adoption hypotheses to falsify

| # | Hypothesis | Falsified if |
| --- | --- | --- |
| H1 | A free bill check that shows £ will convert >8% to paid | <3% after 200 checks |
| H2 | Owners will hand over 12 months of bills for a free audit | <40% of interviewees do |
| H3 | Multi-site customers expand from 1 site to 2+ within 6 months | Expansion <20% |
| H4 | Verified savings reports retain customers better than dashboards | Churn identical with/without |
| H5 | £49 is an impulse purchase for one site | Starter conversion ≈ 0 or refunds >10% |

## E5. Evidence already in the product

- The public bill check returns a **deterministic** number from the published Ofgem cap for the site’s region (26.32p average unit rate, 54.83p standing charge for 1 Oct–31 Dec 2026, from the cap table in `server/src/lib/priceCap.ts`), not a teaser.
- The audit engine is the paid engine: the same findings appear after subscription.
- Every finding carries evidence (rate charged vs cap, arithmetic, VAT treatment), which is what a sceptical owner needs before believing “you could save £412”.

---

# Part F — Competitor analysis

Every company below was checked live on **7 November 2026** (their own site titles/descriptions are quoted). Prices are mostly not public in this market — the buying mechanism matters more than the sticker.

| Player | What they are (verified) | Who pays them | Where they beat us | Where we beat them |
| --- | --- | --- | --- | --- |
| **Bionic** (bionic.co.uk; absorbed Make It Cheaper) | “The comparison site for your small business… energy, insurance, connectivity & finance” | Suppliers (commission) | Brand, inbound volume, human experts, switching muscle | No ongoing analysis, no verified savings, no engineering-grade evidence per bill; commission tie |
| **Love Energy Savings** | “Compare business energy prices… Join 500,000+ businesses” | Suppliers | Scale and trust, cheap switching | Transactional: they win when you switch, not when you save |
| **Utility Helpline** | “Commercial energy brokers” | Suppliers | Relationships, procurement | Same gap: no continuous product, no per-site data model |
| **Inspired PLC** | “UK’s leading commercial energy & sustainability consultancy” | Clients (fees/retainer) | Enterprise credibility, procurement and Net Zero services | Price point and time-to-value: weeks of consultancy vs a 90-second bill check |
| **Octopus Energy for Business** | Supplier | Meter margin | Owns the meter and the tariff; can bundle | They sell their tariff, not an independent audit of it. We are supplier-neutral |
| **Kaluza** | “Energy Intelligence & Optimisation Software” | Utilities/enterprise | Deep optimisation, grid-scale integrations | Not sold to a 6-site restaurant group; implementation-heavy |
| **EnergyElephant** | “Energy management systems and sustainability software” | Organisations (subscription) | Utility-data ingestion and ESG reporting depth | ESG/reporting focus; lighter on UK bill-error recovery and UK-specific cap benchmarking |
| **GridBeyond** | Industrial demand flexibility / AI optimisation | Industrial clients | Flexibility revenue at scale | Industrial-only; not SME self-serve |
| **OneApp Energy** (the brief’s UX reference) | **Domain did not resolve** at check time (DNS failure) | Unknown | — | Treat as unverifiable: do not copy a product you cannot inspect, and do not cite it to investors |

## F1. The gap we are aiming at

```
             high price / enterprise
                     ▲
   Inspired PLC      │      Kaluza, GridBeyond
   TEAM Energy       │      EnergyElephant
                     │
  ───────────────────┼──────────────────────────▶  continuous, software-led
   one-off/advice    │                     
   Bionic, Love      │      ██ EnerOS ██
   Utility Helpline  │      (self-serve, per site,
                     │       verified savings)
             low price │
```

**Positioning sentence:** *“EnerOS is the only per-site energy product a 5–25 site UK business can start using in 90 seconds, that proves savings against a published benchmark instead of a commission.”*

## F2. Moat, honestly assessed

| Moat candidate | Strength today | How to make it real |
| --- | --- | --- |
| Deterministic engine + evidence per finding | Real but copyable | Publish methodology; make “engine decides, AI explains” a trust brand |
| Half-hourly data per site | Weak until ingestion is easy | Email-forward + CSV + consent flow; data compounds |
| Verified-savings baseline | Real, defensible if measured well | Keep the baseline engine auditable; show confidence intervals |
| Switching costs | Low at one site | Portfolio view, benchmarks across customers, integrations |
| Hardware | None yet | Optional CT gateway (Part G) makes data capture physical |

---

# Part G — A hardware business you can start alongside

The software’s biggest constraint is **data**: most 1–25 site SMEs have a half-hourly *capable* meter but no easy way to hand over the data. Hardware fixes that and creates a second revenue line with much higher retention.

## G1. Options, costed

| Product | What it does | BOM **[assumption]** | Sell price **[assumption]** | Attach |
| --- | --- | --- | --- | --- |
| **CT-clamp gateway** (ESP32 + 3× SCT-013 + PSU + DIN case) | Real kW every 10s, uploaded to the same API as HH data | £38–£65 | £149–£199 | £5/site/mo data |
| **Fridge/freezer sensor** (ESP32 + DS18B20 + reed switch, battery) | Temperature + door events; food-safety evidence and “door left open” waste | £12–£18 | £49 | £2/site/mo |
| **Modbus/BMS bridge** (RS485 + ESP32, DIN rail) | Reads existing meters/BMS registers | £45–£70 | £249 installed | £8/site/mo |
| **EV charge control** | OCPP smart charging | — | **Partner, don’t build** (Zappi/Ohme/Indra) | software fee |

## G2. Why this is a good second act (and a bad first one)

**Good:** it converts a data problem into a product; hardware plus subscription churns far less than software alone; it gives you a physical reason to visit a site (installation = sales call); and BOM at £40 against £179 retail is a 4× gross margin before the subscription.

**Bad as a first act:** certification (UKCA/EMC; **MID metering** if you ever bill on the readings), RMA and support burden, cash tied up in stock, and installation logistics. A failed batch of 100 units can consume a year of software margin.

## G3. Recommended sequence

1. **Now:** software only; get 50 paying sites.
2. **Year 2, month 1–3:** 20 hand-built CT gateways to design partners. Measure install time, failure rate, WiFi realities (basement plant rooms, no signal).
3. **Month 4–6:** small production run (100 units) with a UK contract manufacturer; UKCA self-declaration for EMC; clear “not billing-grade” labelling.
4. **Month 7+:** bundle as the “Data Pack” add-on for Starter customers — the upgrade path from bill-only to half-hourly without waiting for the supplier.
5. **Never:** claim MID accuracy, or control refrigeration.

## G4. The honest unit economics of one gateway

| Line | £ |
| --- | --- |
| Retail | 179 |
| BOM + assembly | 55 |
| Certification amortised (100 units) | 15 |
| Shipping/returns allowance | 12 |
| Install (if you do it) | 45 |
| **Gross per unit** | **52 (29%)** |
| Attached subscription, 24 months × £5 | 120 |
| **Two-year value per unit** | **172** |

Hardware alone is a mediocre business. Hardware **as an attach** to a £97/site/month subscription is a good one.

---

# Part H — Marketing plan

## H1. The offer ladder (this is the whole strategy)

| Rung | Offer | Price | Purpose |
| --- | --- | --- | --- |
| 1 | **Free bill check** (`/start`) | £0, no account | Prove a number in 90 seconds |
| 2 | **Account + saved audit** | £0 | Capture the site, start the relationship |
| 3 | **Paid 12-month audit** (human-delivered, engine-backed) | £250 one-off | Fund the business before subscriptions scale |
| 4 | **Subscription** | £49–£249/site/mo | The product |
| 5 | **Portfolio** (multi-site, benchmarks) | Growth/Autonomous | Expansion revenue |
| 6 | **Data Pack** (CT gateway) — year 2 | £179 + £5/mo | Data moat and retention |

## H2. Channels, costed

| Channel | Tactic | Cost **[assumption]** | Expected CAC | When |
| --- | --- | --- | --- | --- |
| Founder outbound | 100 LinkedIn touches/week to ops/finance at 5–25 site groups; lead with a free audit | £0 (time) | £120 | Month 1 |
| SEO / content | “business energy bill check”, “standing charge too high”, “Agile for business”, “how to read a business electricity bill” | £0–£500/mo freelance | £60 (organic) | Month 1–12 |
| Broker/accountant referrals | 10–15% of year-one revenue; they keep the switching commission and hand you the analysis | £250 per customer | £250 | Month 2 |
| Trade bodies & communities | Hospitality/retail/care associations; webinars; a free audit for members | £0–£300/event | £150 | Month 3 |
| Paid search | £1,000/mo test on 20 high-intent terms | £1,000/mo | £450 (test, then optimise) | Month 4, only if organic works |
| Local press / case studies | “We found £X on a Birmingham restaurant’s bill” | £0 | £0 (brand) | Month 2+ |
| Partnerships with installers | Electricians/refrigeration engineers introduce you at the point of pain | Revenue share | £150 | Month 6 |

**Do not** start with paid ads. At £4 CPC and 1.5% conversion, a customer costs ~£450 before you know whether the product retains.

## H3. Twelve-month calendar

| Month | Focus | Output |
| --- | --- | --- |
| 1 | 10 paid audits, 5 design partners, pricing page live | First £2,500 revenue, 3 case studies |
| 2 | SEO foundation (10 pages), audit → subscription conversion | 10 paying sites |
| 3 | Broker partnerships (3 signed), webinar #1 | 25 sites |
| 4 | Paid search test (£1,000), onboarding polish | 40 sites |
| 5 | Vertical landing page (hospitality), referral programme | 55 sites |
| 6 | First verified-savings report published | 70 sites, churn measured |
| 7–9 | Case-study engine, accountant channel, price test | 100–120 sites |
| 10–12 | Annual plans (once priced), portfolio upsell, partner portal | 150+ sites |

## H4. Message hierarchy (tested in the bill-check copy)

1. **“Stop paying for energy you never used.”** — the hook.
2. **“Check a bill free in 90 seconds.”** — the friction remover.
3. **“Every £ labelled estimated or verified.”** — the trust wedge against brokers and AI hype.
4. **“Priced per site, per month. No commission.”** — the structural difference from a broker.

## H5. Metrics that decide spend

| Metric | Target | Kill rule |
| --- | --- | --- |
| Bill checks / week | 50 by month 3 | <10 after 8 weeks of outbound |
| Check → account | ≥25% | <10% |
| Account → paid | ≥35% | <15% |
| CAC payback | ≤3 months | >6 months for 3 months |
| Logo churn | ≤3%/mo | >6%/mo at 50 sites |
| Sites per customer | ≥1.6 and rising | flat at 1.0 |

---

# Part I — Viability study

## I1. Market size (assumptions stated, not hidden)

| Layer | Figure | Basis |
| --- | --- | --- |
| UK businesses | ≈5.5m, ~99.9% SMEs | DBT *Business Population Estimates* (verify the current release at publish) |
| Non-domestic electricity meters | ≈2m | Ofgem/DESNZ market data (verify) |
| Serviceable: SMEs with >£10k/yr electricity and 1–25 sites | **≈400,000 sites** **[assumption]** | Excludes micro-consumption and industrial |
| Our price | £97/site/mo blended | Part D1 |
| **SAM** | **≈£465m/year** | 400,000 × £1,164 |
| Realistic 3-year share | 0.3% → **1,200 sites** | Comparable SME SaaS adoption |
| **SOM (ARR at year 3)** | **≈£1.4m** | 1,200 × £1,164 |

Even a pessimistic 0.05% share (200 sites) is a £233k ARR business with ~94% gross margin — small, but a real company. The risk is not market size; it is sales efficiency and retention.

## I2. Scenarios (sites at 12 / 24 / 36 months)

| Scenario | 12m | 24m | 36m | ARR at 36m | What has to be true |
| --- | --- | --- | --- | --- | --- |
| **Bear** | 40 | 120 | 300 | £349k | Organic only, churn 4%/mo, no sales hire |
| **Base** | 120 | 500 | 1,200 | £1.40m | Audits fund year 1, one sales hire in year 2, churn 2.5%/mo |
| **Bull** | 250 | 1,000 | 3,000 | £3.49m | Broker channel works, annual plans land, Data Pack attach at 20% |

## I3. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Churn above 4%/mo (SMEs die, move, or ignore it) | High | Severe | Verified-savings monthly email; annual plans; multi-site land-and-expand; onboarding that captures bills automatically |
| Sales cycle longer than modelled | High | High | Free audit as the wedge; price at £49 entry; sell to the owner, not procurement |
| Half-hourly data access friction | High | Medium | Email-forward, CSV import, CT gateway (Part G) |
| A broker bundles a free audit | Medium | Medium | Be the audit layer brokers use (referral programme), not their enemy |
| AI cost or accuracy incident | Medium | Medium | Deterministic engine decides; AI only narrates; per-day spend caps |
| Security breach of supplier credentials | Low | Severe | Fernet at rest, least-privilege tokens, rotate, pen test, incident runbook |
| Regulatory misstep (implied brokerage/advice) | Medium | Medium | Explicit “not a supplier or broker”, no switching commission, legal review of claims |
| Key-person dependency | High | High | Document runbooks (Part A); contractor bench for support |
| Price war from comparison sites | Medium | Medium | Compete on verified savings and per-site depth, not on switching fees |

## I4. Kill criteria (write these down before you fall in love)

1. Fewer than **3%** of 200 bill checks become paying customers.
2. Logo churn above **6%/month** once you have 50 sites.
3. CAC payback above **6 months** for three consecutive months.
4. Fewer than **20%** of single-site customers add a second site within 6 months (no expansion = no venture case).
5. A regulatory opinion that per-site savings claims require authorisation you do not have.

## I5. Recommendation

**Proceed — but as a bootstrap, not a venture bet, until retention is measured.**

- The product is built and tested; the marginal cost of the first 50 customers is under £500/month.
- The audit service funds the quiet period and doubles as customer research.
- The base case reaches break-even somewhere between **20 and 100 sites**, which is an achievable year-one target for one founder with a referral channel.
- The upside case (hardware attach + portfolio expansion + broker channel) is credible but should not be modelled until 50 sites prove retention.

What to do in the next 30 days: 10 paid audits, 5 design partners, Clerk + Stripe live, legal pack, ICO, Sentry, and the export/delete endpoints. Then measure, not guess.

---

# Part J — Decisions needed (with owners)

| # | Decision | Options | Default if nobody decides | Owner |
| --- | --- | --- | --- | --- |
| 1 | **Site caps per plan** (currently 3 / 10 / 25, flagged `provisional` in `plans.ts`) | Keep / raise / remove caps and bill purely per site | Keep provisional; do not publish “unlimited” | Commercial |
| 2 | **Annual billing** (README defines no annual price) | Publish an annual price (e.g. 10 months for 12) / drop the toggle | Stay monthly-only, toggle hidden | Commercial |
| 3 | **VAT registration timing** | At £90k / voluntary earlier | Register as you approach £90k | Finance |
| 4 | **Dunning policy** | 7-day grace then read-only / immediate lock / longer grace | 7 days, data preserved | Product |
| 5 | **Support SLA** | One business day / 4 hours | One business day, published | Operations |
| 6 | **Beachhead segment** | Hospitality groups / care homes / retail chains | Hospitality (highest kWh per sqm) | Growth |
| 7 | **Audit price** | £250 / £500 / free with subscription | £250, credited to month one | Commercial |
| 8 | **Hardware** | Build CT gateway / partner / never | Decide at 50 paying sites | Founders |
| 9 | **Broker channel** | Referral partnership / avoid (independence) | Referral with disclosed fee; never take switching commission | Founders |
| 10 | **Data retention** | 6 years (HMRC) / shorter + export | 6 years for invoices, 24 months for raw HH | Compliance |

---

# Appendix — sources and assumptions

## S1. Prices read live on 7 November 2026

| Source | What was taken |
| --- | --- |
| `stripe.com/gb/pricing` | 1.5% + 20p standard UK cards; 2.5% + 20p EU; 2.8% + 20p premium UK; 0.5% currency conversion; VAT on fees |
| `vercel.com/pricing` | Pro $20/mo, usage-based extras |
| `clerk.com/pricing` | Pro $20/mo (annual billing), 50,000 MRU included, $0.02/mo each additional, Business $250/mo |
| `developers.cloudflare.com/r2/pricing` | $0.015/GB-month storage, $0.36/million Class B operations, egress free |
| `mongodb.com/pricing` | Free 512 MB; Flex $0.011/hour capped at $30/month; Dedicated from $56.94/month |
| Google Cloud Vertex AI pricing (Gemini models) | Gemini 2.5 Pro $1.25/1M input, $10/1M output; Flash-class intro $0.75/$3.75 per 1M to 31 Dec 2026, then $1.50/$7.50 |
| `resend.com/pricing` | Free 3,000/mo (100/day); Pro $20/mo for 50,000; $0.90 per extra 1,000 |
| `sentry.io/pricing` | Team $26/mo; Business $80/mo |
| `posthog.com/pricing` | Free tier then usage-based (per event) |
| `upstash.com/pricing/redis` | $0.20 per 100,000 commands |
| `github.com/pricing` | Team $4/user/month |
| `gov.uk` Companies House fees | £50 incorporation (online) |
| `gov.uk/vat-registration` | £90,000 rolling-12-month threshold |
| Frankfurter FX API | £1 = $1.3385 (6 Nov 2026) |
| `server/src/lib/priceCap.ts` (repo) | Ofgem cap 1 Oct–31 Dec 2026: 26.32p average unit rate, 54.83p average standing charge |

## S2. Competitor pages read live on 7 November 2026

`bionic.co.uk` · `loveenergysavings.com` · `utilityhelpline.co.uk` · `inspiredplc.co.uk` · `octopus.energy/business` · `kaluza.com` · `energyelephant.com` · `gridbeyond.com` (SSL error at check; known industrial flexibility provider) · `oneapp.energy` (**DNS did not resolve** — treated as unverifiable).

## S3. Assumptions register (validate, then delete this table)

| Assumption | Used in | Validate by |
| --- | --- | --- |
| Plan mix 60/32/8 | D1 | First 30 customers’ actual plan choices |
| Sites per customer 1.6 → 2.2 | D1, D4 | CRM at 6 months |
| Churn 3%/mo → 2%/mo | D1, D4, I2 | Stripe cancellation data from month 3 |
| Check → account 25%, account → paid 35% | H5 | PostHog funnel after 200 checks |
| CAC £120/£250/£450 | D4, H2 | Actual spend ÷ new customers, monthly |
| 400,000 serviceable sites | I1 | Verify against Ofgem/DESNZ non-domestic meter data |
| UK SME population ≈5.5m | I1 | DBT Business Population Estimates, current release |
| BOM and retail prices for hardware | G1–G4 | Two quotes from a UK contract manufacturer |
| Support cost 0.4 FTE per 100 sites | D2 | Ticket volume per customer per month |
| ICO fee £52 | A1, C1 | ico.org.uk fee checker |

## S4. What this document does not claim

- It does **not** claim current paying customers; there are none.
- It does **not** claim verified savings at scale; verification exists in the product, not yet in the market.
- It does **not** price enterprise support, SOC 2 or a data-licensing business, because none of those have demand evidence yet.
- It does **not** treat the brief’s reference site as a benchmark, because it could not be reached.
