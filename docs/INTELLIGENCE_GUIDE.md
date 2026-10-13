# EnerOS — Intelligence Guide

How EnerOS thinks: the live data layer, the deterministic engines, and the
Gemini-backed Copilot and Auditor. Read this alongside
[`IMPLEMENTATION_GUIDE.md`](./IMPLEMENTATION_GUIDE.md) (data sources and the
live feeds) and [`../README.md`](../README.md) (what exists today).

---

## 1. The one architectural rule

> **The engine decides. The AI explains.**

Every number the customer sees is produced by deterministic code against a
published source or the customer's own data:

| Engine | File | Decides |
| --- | --- | --- |
| Bill analysis | `server/src/lib/analysis.ts` | Whether a bill has findings, and their £ impact |
| Live derivations | `server/src/lib/live/derive.ts` | Which half-hour windows are cheapest/peak, and what a shift saves |
| Site energy flow | `server/src/lib/live/flow.ts` | The live kW at each asset and the resulting cost |

The LLM never decides any of this. It is given the engine's output and asked to
*narrate* it. That is what makes the product defensible: an auditor can challenge
a finding with arithmetic, and a hallucinated finding is structurally impossible
because the model can only see findings the engine already produced.

The LLM is used for exactly three jobs, all powered by Gemini:
1. **Read** a bill (text → typed fields) — `server/src/lib/llm.ts` `extractBill`.
2. **Explain** a bill audit — `server/src/lib/auditor.ts` `narrateAudit`.
3. **Answer** questions in the Copilot — `server/src/lib/copilot.ts` `answerCopilot`.

---

## 2. What is built

### Live UK data (real, key-less)
- `GET /api/live/status|tariff|carbon|snapshot` — Octopus Agile half-hourly
  prices for the site's own distribution region, and NESO carbon intensity.
- `GET /api/live/site-flow` — the whole-site Energy Flow Diagram (solar, battery,
  grid, EV, load), priced from the live curve.

### Grounded intelligence
- `POST /api/copilot/chat` — grounded chat. The server builds a computed context
  from the workspace + live snapshot, Gemini narrates it.
- `GET /api/copilot/suggestions` — starter prompts + whether Gemini is live.
- `POST /api/analysis/narrate` — run the audit engine, then narrate the findings.
- `GET /api/config` — reports `geminiEnabled`, so the UI can label answers honestly.

### Degradation
Every LLM path returns `source: "unavailable"` (Copilot/Auditor) when Gemini is
not configured or fails. The clients then fall back to deterministic answers and
say so in the UI. The app never breaks and never pretends a model answered.

---

## 3. Enabling Gemini

Add to `server/.env`:

```bash
GEMINI_API_KEY=your-key-from-aistudio.google.com
GEMINI_MODEL=gemini-1.5-flash
# Optional: override for testing against a stub
# GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

Get a key at <https://aistudio.google.com/app/apikey>. Restart the API and check:

```bash
curl -s localhost:4000/api/config | grep geminiEnabled   # → true
curl -s localhost:4000/api/health                         # → analysis: "llm"
```

**Model choice.** `gemini-1.5-flash` is the default: fast and cheap, which suits
short grounded answers. For harder reasoning (multi-site diagnostics) set
`GEMINI_MODEL=gemini-1.5-pro`. Because the model only narrates pre-computed
numbers, Flash is sufficient for the Copilot in almost every case.

**Cost control.** The context is a *computed summary*, not raw rows (§5), so a
prompt is typically 1–3k tokens regardless of portfolio size. Responses are
capped by the JSON contract. If cost matters, lower the number of history turns
sent (currently the last 8).

---

## 4. The prompts

The prompts are the product. They live in the server so they cannot drift from
the code that grounds them.

### 4.1 Copilot — `COPILOT_SYSTEM_PROMPT` (`server/src/lib/copilot.ts`)

Built to make the model behave like an **energy management OS**, not a chatbot.
It states:

- **Identity** — a competent, commercial energy manager for UK SMEs; lead with money.
- **The four questions** EnerOS answers (consume / cost / change / automate).
- **The grounding rule** — use only the GROUNDED CONTEXT block; if it is not
  there, say so; never invent a figure, schedule or tariff.
- **UK conventions** — p/kWh, standing charge p/day, the Ofgem cap applies to
  domestic tariffs, ToU/Agile cheap half-hours, DUoS/VAT/HH settlement.
- **The trust ladder** — Recommend → Approve → Automate; never call a modelled
  saving “verified”.
- **A JSON output contract** — `{ "answer": "...", "suggestions": ["..."] }` so
  the UI can render text *and* follow-up chips deterministically.

Edit the prompt in the file, never in a playground, so the change is reviewed and
testable.

### 4.2 Auditor — `AUDITOR_SYSTEM_PROMPT` (`server/src/lib/auditor.ts`)

Narrower by design. It receives only the engine's findings and is told, in hard
rules, to:

- use **only** the findings provided — never add a finding, figure or cause;
- rank by financial impact, biggest first;
- explain the difference between a positive `impactGbp` (the supplier owes you)
  and a negative one (an avoidable cost);
- cite the licence condition / policy threshold that makes a finding defensible;
- be honest about low confidence;
- never call “above the domestic cap” a breach for a business site;
- return `{ summary, actions[] }`.

### 4.3 Why JSON

Both prompts return strict JSON. `callGemini({ json: true })` sets
`responseMimeType: application/json`, and the parsers strip a stray markdown
fence as a belt-and-braces measure. Deterministic parsing is what lets the UI
render answers *and* suggestions without brittle text-scraping.

---

## 5. Grounding: computed summary, not raw rows

`buildCopilotContext()` (`server/src/lib/copilot.ts`) and `buildAuditContext()`
(`server/src/lib/auditor.ts`) turn the workspace into a compact block:

```
=== GROUNDED CONTEXT (the customer real data) ===
Company: Harbour Hospitality Group
Sites in portfolio: 12
Current control mode: Approve (Recommend -> Approve -> Automate)
--- Portfolio, current month ---
Actual spend: £81,420.00
Expected spend (baseline): £91,600.00
Saving vs baseline: £10,180.00 (11.1%)
--- Live UK market (real, fetched now) ---
Current half-hour price: 29.66p/kWh
Cheapest 3h window: ... at 15.80p/kWh
```

Two reasons this beats dumping invoice rows into the prompt:

1. **Correctness.** The server does the arithmetic; the model only quotes it. A
   model that never adds up cannot add up wrong.
2. **Cost and latency.** The prompt stays roughly constant as the portfolio
   grows from 12 sites to 3,000.

To extend grounding, add a section to the relevant context builder — do not add
raw data to the prompt.

---


## 6. API surface (intelligence)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/copilot/chat` | bearer | Grounded chat. Body `{ message, history?, siteId? }` |
| `GET` | `/api/copilot/suggestions` | public | Starter prompts + `geminiEnabled` |
| `POST` | `/api/analysis/narrate` | bearer | Run the engine, narrate the findings |
| `GET` | `/api/config` | public | Includes `geminiEnabled` and `llmEnabled` |

`POST /api/copilot/chat` response:

```json
{
  "reply": "You spent £81,420 this month…",
  "suggestions": ["Which sites are above baseline?", "What should I approve first?"],
  "source": "gemini",
  "geminiEnabled": true,
  "groundedOn": { "sites": 12, "invoices": 12, "actions": 8, "live": true }
}
```

`groundedOn` is shown in the UI as an honesty signal — the customer can see the
answer was grounded on their own data and the live market.

---

## 7. Suggestions

Suggestions are how the Copilot teaches the product. Two sources:

1. **Static starters** (`GET /api/copilot/suggestions`) — shown when the thread
   is empty: “Where are we spending most?”, “What should I approve first?”, etc.
2. **Model-generated follow-ups** — the prompt requires up to three
   `suggestions`, which the UI renders as clickable chips under each answer.

They are validated server-side (`Array.isArray`, string filter, max 3) before
being returned, so a malformed model response cannot break the UI.

---

## 8. Verification

```bash
cd server
npm run verify:copilot     # 22 checks: context builder + Gemini parsing + auditor, offline
npm run verify:live        # 33 checks: live derivations + site flow
npm run verify:analysis    # 24 checks: the bill engine
npm run smoke              # 24 checks: end-to-end API
```

`verify:copilot` stubs `fetch`, so it proves the request/response handling and
the grounding without a key or network. It covers: context contents, the happy
path, fenced JSON, non-JSON text, upstream 500 → `unavailable`, and the auditor
narration.

---

## 9. Next steps to make it fully intelligent

Ordered by leverage.

1. **Tool-calling instead of a static context.** Give the model callable tools
   (`get_spend(siteId, period)`, `get_findings(invoiceId)`, `get_cap_period()`,
   `get_live_price()`). The context block already proves the pattern; tools let
   the model ask for *more* when a question needs it, without bloating every prompt.
2. **Anomaly explanations.** “Why is Harbour House 22% above baseline?” → the
   model calls the anomaly endpoint and explains, citing the numbers it was given.
3. **Copilot actions.** Let the Copilot propose an Optimiser action
   (“Move the defrost cycle to 22:00”) which the user approves in one click —
   closing the loop from explanation to Recommend → Approve → Automate.
4. **Persist conversations.** Store threads so a customer can return to an
   answer, and so suggestions improve from real usage.
5. **Evaluation harness.** A fixture set of questions with expected facts, run in
   CI, to catch prompt regressions the way `verify:analysis` catches engine ones.
6. **Half-hourly ingestion (Phase 3).** Once real consumption is stored, the
   Copilot can answer “what did we actually save?” with a measured outcome — the
   verified-savings KPI the plan calls the key metric.

> **Do not** let the model produce findings, savings figures, or control
> decisions. It reads, explains and suggests. The engines decide.


---

## 10. Troubleshooting Gemini (when it “fails to invoke”)

The original implementation swallowed every error (`catch { return null }`), so a
failure looked identical to “no key configured”. That is fixed: every failure is
now a typed `GeminiFailure` with a `code`, the HTTP `status`, the raw Google
message in `detail`, and an actionable `hint`.

### Two ways to see exactly where it fails

**1. CLI (fastest, works without the server running):**

```bash
cd server
npm run verify:gemini            # offline failure matrix + config report
npm run verify:gemini -- --live  # + a real call; prints status + raw error
```

**2. HTTP (from the browser or curl, no shell access needed):**

```bash
curl -s localhost:4000/api/copilot/diagnose -H "Authorization: Bearer $TOKEN" | jq
```

Both return the same shape:

```json
{
  "config": { "configured": true, "model": "gemini-1.5-flash", "keyPresent": true, "keyHint": "BADK…EY" },
  "live": {
    "ok": false,
    "failure": {
      "code": "http",
      "status": 400,
      "message": "API key not valid. Please pass a valid API key.",
      "hint": "The API key is invalid — regenerate it at aistudio.google.com/app/apikey."
    }
  }
}
```

The chat endpoint also returns `reason` and `hint` when `source` is
`"unavailable"`, and the Copilot UI shows them in an amber line so you never have
to guess.

### Failure codes and what they mean

| `code` | Meaning | Fix |
| --- | --- | --- |
| `no-key` | `GEMINI_API_KEY` not set on the server | Add it to `server/.env`, restart |
| `http` (400) | Invalid API key | Regenerate at aistudio.google.com/app/apikey |
| `http` (403) | Key lacks access / API not enabled for the project | Enable the Generative Language API, check key restrictions |
| `http` (404) | Model name not found | The model may be retired — try `GEMINI_MODEL=gemini-2.0-flash`, or list models: `GET v1beta/models?key=…` |
| `http` (429) | Quota / rate limit | Wait, or use a cheaper tier |
| `http` (5xx) | Google-side error | Usually transient — retry |
| `network` | Could not reach `generativelanguage.googleapis.com` | Check outbound network / proxy |
| `timeout` | No response within `UPSTREAM_TIMEOUT_MS` | Raise the timeout, check connectivity |
| `empty` | Prompt blocked (`promptFeedback.blockReason`) or no candidates | Check the prompt and safety settings |

### Trap: the key is set but the tool still says `test…ey`

If `verify:gemini` prints `key present: true (test…ey)`, it is running with the
**placeholder** key, not yours — your real key was not loaded. Two causes, both
now fixed but worth knowing:

1. The key is not in `server/.env`. Create it there:
   ```bash
   cd server && cp .env.example .env   # then set GEMINI_API_KEY=...
   ```
2. The process was started from a different working directory. `env.ts` now loads
   `server/.env` **module-relative**, so the API picks up its keys whether it was
   started from `server/`, the repo root, or a workspace task. Real environment
   variables still win over the file (so Vercel/Docker/CI are unaffected).

A correct key shows a hint like `AIza…90`. Anything else means the file is not
being read.

### The most likely cause on a fresh setup

An **invalid or missing key** (400 `API_KEY_INVALID`), because `gemini-1.5-flash`
and the request shape are correct — verified against the live API. Run
`npm run verify:gemini -- --live` with the key set; if it prints `ok live call
succeeded`, the server config is good and the issue is elsewhere (e.g. the key is
only set locally, not in the deployed environment).

