# EnerOS — AI Energy Manager (billing & optimisation console)

A React front-end for **EnerOS**, *“the autonomous energy manager for Britain’s small and
medium businesses.”* It implements the product described in the attached business plan,
with a focus on the **energy billing** workflow: monitoring spend, auditing invoices,
optimising energy use and billing the customer.

> All figures are illustrative mock data. The dataset is deliberately *internally consistent*
> so the numbers reconcile: site spend sums to **£81,420**, expected spend to **£91,600**,
> therefore the dashboard reports **£10,180 saved** — exactly the plan’s example.

## Feature overview (mapped to the plan)

| Page | Plan module | What it does |
| --- | --- | --- |
| **Dashboard** – Energy Intelligence | Module A | Spend vs. expected baseline, verified savings, spend by asset and by site, latest AI findings, and the baseline → intervention → outcome methodology. |
| **Bill Auditor** | Module B | Upload/enter an invoice, run a heuristic “AI audit”, and review detected issues: *incorrect charge, abnormal consumption, tariff discrepancy, standing charge, meter issue, unexpected change*. Challenge a supplier to request recovery. |
| **Optimiser** | Module C & D | Recommended actions with schedule changes, model confidence and £ savings. **Recommend → Approve → Automate** control mode plus a per-action approve/automate flow. |
| **Sites** | Layer 1 – Energy Data OS | Portfolio of sites with controllable loads, meter type, spend, savings and status (Optimal / Watch / Anomaly). |
| **Copilot** | Layer 2 – AI Energy Brain | A grounded chat assistant that answers questions about spend, savings, tariffs, refrigeration and EV charging. (The Copilot *explains*; the optimisation engine *decides*.) |
| **Plans & Billing** | §6 Pricing | Starter £99 / Optimise £199 / Autonomous £349 per site/month, an interactive **performance-fee calculator** (15% of verified savings), flexibility revenue share, annual value summary and the plan’s worked business case. |

Interactive behaviour is real: approving actions updates metrics, running an audit adds an
invoice and re-computes KPIs, and the fee calculator recalculates live.

## Tech stack

- **React 19** + **TypeScript**
- **Vite 8** (build tooling / dev server)
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **React Router v7** (client-side routing)
- **Recharts** (charts)
- **lucide-react** (icons)

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check (tsc --noEmit) then production build to dist/
npm run preview    # preview the production build
npm run typecheck  # type-check only
```

## Project structure

```
src/
├─ App.tsx                 # routes
├─ main.tsx                # entry (BrowserRouter + AppProvider)
├─ store.tsx               # app state, derived metrics, mutations (Context)
├─ types.ts                # domain model
├─ index.css               # Tailwind v4 + design tokens
├─ lib/
│  ├─ format.ts            # en-GB £ / kWh / % formatting
│  └─ cx.ts                # classname joiner
├─ data/mock.ts            # 12 sites, invoices, actions, plans (consistent figures)
├─ components/
│  ├─ Layout.tsx           # sidebar nav, top bar, toast host
│  └─ ui.tsx               # Card, StatCard, Badge, ProgressBar, EmptyState
└─ pages/
   ├─ Dashboard.tsx        # Module A
   ├─ Bills.tsx            # Module B
   ├─ Optimiser.tsx        # Module C / D
   ├─ Sites.tsx            # Layer 1
   ├─ Copilot.tsx          # Layer 2
   └─ Plans.tsx            # Pricing & billing
```

## Mobile app (React Native / Expo)

`mobile/` is a React Native port of the same product. It **reuses the domain logic** — the
store, mock dataset, types and formatting helpers were ported from `src/`, and the UI kit,
hand-rolled SVG charts and six screens were rebuilt for a phone viewport.

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
| Bill Auditor | `src/screens/BillsScreen.tsx` | Filter chips, audit sheet, issue recovery |
| Optimiser | `src/screens/OptimiserScreen.tsx` | Recommend → Approve → Automate flow |
| Sites | `src/screens/SitesScreen.tsx` | Portfolio, controllable loads, status |
| Copilot | `src/screens/CopilotScreen.tsx` | Chat thread + suggestion chips + keyboard handling |
| Plans | `src/screens/PlansScreen.tsx` | Tiers, live performance-fee calculator (`Slider`), business case |

Mobile-specific adaptations:

- **No Tailwind / DOM.** Design tokens live in `src/theme.ts` and are mirrored into
  `StyleSheet.create`; charts are hand-written with `react-native-svg` (Recharts is DOM-only).
- **`Intl` is not trusted on Hermes.** `src/lib/format.ts` provides RN-safe formatting and a
  hand-rolled `compactGbp`, since `notation: 'compact'` is not reliable.
- **`Chips` replaces `<select>`** and `KeyboardAvoidingView` wraps the Copilot thread.
- Six bottom tabs via `@react-navigation/bottom-tabs`, wrapped in `SafeAreaProvider` +
  `AppProvider`; `ToastHost` floats above the tab bar.

## Notes & assumptions

- **No backend.** Data lives in `src/data/mock.ts`; state is held in a React Context
  (`src/store.tsx`). Swapping in a real API means replacing the store’s data source and
  mutation functions — the pages consume the store through the `useApp()` hook only.
- **The “AI” is a deterministic demo** (keyword matching in `Copilot.tsx` and a small
  heuristic in `store.tsx#auditInvoice`) so the app runs offline and predictably.
- **Currency is GBP** and formatting is en-GB throughout, matching the UK SME focus.
- Pricing, the 15% performance fee and the 20–30% flexibility share follow the plan and are
  presented as *testable assumptions*, not fixed commitments — as the plan itself notes.
- The production bundle is a single chunk (~700 kB, mostly Recharts). Code-splitting per
  route would be the next optimisation if bundle size matters.
