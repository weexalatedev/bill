/**
 * `npm run verify:theme` — renders every tone of every primitive, plus the two
 * most style-sensitive screens, and asserts the output is monochrome (no
 * chromatic utility class, no `font-mono`).
 *
 * The theme is enforced in one place (`src/index.css` tokens + `src/components/ui.tsx`),
 * so this exists to catch the moment a colour or a webfont creeps back in.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge, Card, EmptyState, ProgressBar, SectionHeading, StatCard } from '../src/components/ui';
import AuditResult, { type AuditView } from '../src/views/start/AuditResult';
import DoneStep from '../src/views/onboarding/DoneStep';
import SiteStep from '../src/views/onboarding/SiteStep';
import MoreSitesStep from '../src/views/onboarding/MoreSitesStep';
import UploadBill from '../src/views/start/UploadBill';
import BillForm from '../src/views/start/BillForm';

const TONES = ['solid', 'outline', 'muted', 'ghost'] as const;
const CHROMATIC = /emerald|rose|amber|violet|teal|indigo|sky|lime|fuchsia/g;

let failures = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

// ── Primitives ────────────────────────────────────────────────────────────────
const primitives = renderToStaticMarkup(
  <div>
    {TONES.map((tone) => (
      <Badge key={tone} tone={tone}>
        {tone}
      </Badge>
    ))}
    {TONES.map((tone) => (
      <StatCard
        key={tone}
        label="Energy spend"
        value="£81,420"
        sub="vs last month"
        tone={tone}
        trend={{ value: -4.2, goodWhenNegative: true }}
      />
    ))}
    {TONES.map((tone) => (
      <ProgressBar key={tone} value={42} tone={tone} />
    ))}
    <Card>plain card</Card>
    <SectionHeading title="Portfolio" subtitle="Per-site benchmarks" />
    <EmptyState title="Nothing here" hint="Upload a bill to start" />
  </div>,
);

check('primitives render no chromatic classes', !primitives.match(CHROMATIC));
check('primitives render no font-mono', !primitives.includes('font-mono'));
check('solid badge is an ink fill', primitives.includes('bg-ink-900 text-white'));
check('outline badge is a hairline', primitives.includes('border-ink-900/25'));
check('stat labels are kickers', primitives.includes('uppercase tracking-wider'));
check('cards are flat (no shadow)', !primitives.includes('shadow-'));

// ── Screens ───────────────────────────────────────────────────────────────────
const audit: AuditView = {
  score: 46,
  recoverableGbp: 128.49,
  findings: [
    {
      code: 'unit-rate-above-cap',
      severity: 'high',
      title: 'Unit rate 34.00p/kWh is above the cap of 26.49p',
      detail: 'The site is billed above the cap for its region.',
      impactGbp: 112.65,
      recommendation: 'Ask the supplier to re-rate to 26.49p/kWh.',
    },
    {
      code: 'standing-charge-above-cap',
      severity: 'low',
      title: 'Standing charge is above the cap',
      detail: 'The standing charge compounds on every invoice.',
      impactGbp: 5.99,
      recommendation: 'Request a correction to 45.68p/day.',
    },
  ],
  benchmark: {
    label: 'North Western England Ofgem cap',
    unitRateP: 26.49,
    standingChargeP: 45.68,
    consumptionKwh: 1500,
    periodDays: 31,
    expectedTotalGbp: 411.51,
    actualTotalGbp: 540,
    savingGbp: 128.49,
    savingPct: 23.79,
  },
  capLabel: '1 Oct – 31 Dec 2026',
  capUnitRateP: 26.32,
  regionName: 'North Western England',
  advice: { summary: 'Challenge the unit rate first.', actions: ['Request a corrected invoice.'] },
};

const screens = renderToStaticMarkup(
  <div>
    <AuditResult audit={audit} />
    <DoneStep siteCount={2} deviceCount={1} saving={128.49} onFinish={() => {}} />
  </div>,
);

check('screens render no chromatic classes', !screens.match(CHROMATIC));
check('audit hero leads with the saving', screens.includes('£128'));
check('audit hero shows the UK benchmark', screens.includes('£412') || screens.includes('£411'));
check(
  'severity is a black-to-grey ramp',
  screens.includes('bg-ink-900 text-white') && screens.includes('bg-neutral-100 text-neutral-700'),
);

// ── Flow screens: the acquisition and onboarding forms ────────────────────────
const flow = renderToStaticMarkup(
  <div>
    <UploadBill
      busy={false}
      error={null}
      postcode=""
      onPostcodeChange={() => {}}
      onFile={() => {}}
      onSwitchToManual={() => {}}
    />
    <BillForm busy={false} error={null} onSubmit={() => {}} onSwitchToUpload={() => {}} />
    <SiteStep defaultCompanyName="Kirkstall Kitchens" saving={128.49} onSubmit={async () => {}} onSkip={() => {}} />
    <MoreSitesStep sites={[]} onAdd={async () => {}} onContinue={() => {}} onSkip={() => {}} />
  </div>,
);

check('flow screens render no chromatic classes', !flow.match(CHROMATIC));
check('upload step invites a file', flow.includes('Drop your bill here'));
check('bill form asks for the figures', flow.includes('Consumption (kWh)'));
check('site step echoes the audit saving', flow.includes('£128'));
check('empty portfolio says so', flow.includes('No sites yet'));

console.log(`\n${failures === 0 ? 'monochrome theme verified' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
