/**
 * `npm run verify:theme` — enforces design rules v2.
 *
 * Unlike v1 (which only grepped class strings), this check:
 *   1. parses the tokens out of src/index.css and RECOMPUTES every documented
 *      contrast pair, so a palette edit that breaks 4.5:1 fails the build;
 *   2. asserts the structural contract (moment surface, card, evidence states,
 *      live dot, skeleton, draw-in, reduced-motion);
 *   3. scans every className in src/**\/*.tsx for banned patterns: uppercase
 *      labels, utility gradients, `transition-all`, retired helpers, emoji;
 *   4. renders the primitives and asserts meaning colours are actually used.
 *
 * It is deliberately strict: the design is the product's trust argument.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge, Card, EmptyState, ProgressBar, SectionHeading, StatCard } from '../src/components/ui';
import EvidenceMark from '../src/components/EvidenceMark';
import AuditResult, { type AuditView } from '../src/views/start/AuditResult';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

// ── 1. Contrast, recomputed from the tokens ─────────────────────────────────
const css = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --color-${name} is missing from src/index.css`);
  return match[1];
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: [string, string, string][] = [
  ['text-1', 'paper', 'body on paper'],
  ['text-2', 'paper', 'secondary on paper'],
  ['text-3', 'paper', 'tertiary on paper'],
  ['text-1', 'surface', 'body on surface'],
  ['text-2', 'surface', 'secondary on surface'],
  ['text-3', 'surface', 'tertiary on surface'],
  ['verified', 'paper', 'verified on paper'],
  ['verified', 'verified-tint', 'verified on its tint'],
  ['estimated', 'paper', 'estimated on paper'],
  ['estimated', 'estimated-tint', 'estimated on its tint'],
  ['issue', 'paper', 'issue on paper'],
  ['issue', 'issue-tint', 'issue on its tint'],
  ['accent-ink', 'paper', 'accent text on paper'],
  ['accent-ink', 'accent-tint', 'accent text on its tint'],
  ['paper', 'accent', 'white text on the accent button'],
];

for (const [fg, bg, label] of PAIRS) {
  const ratio = contrast(token(fg), token(bg));
  check(`${label} ≥ 4.5:1`, ratio >= 4.5, `${ratio.toFixed(2)}:1`);
}

// On the moment surface the documented twin colours apply.
const moment = token('moment');
for (const [hex, label] of [
  ['#f5f5f4', 'moment body text'],
  ['#6ee7a8', 'verified-bright on moment'],
  ['#f0a06a', 'copper-bright on moment'],
] as const) {
  const ratio = contrast(hex, moment);
  check(`${label} ≥ 4.5:1`, ratio >= 4.5, `${ratio.toFixed(2)}:1`);
}

// ── 2. Structural contract ──────────────────────────────────────────────────
const required = [
  ['.eos-moment', 'moment surface'],
  ['.eos-card', 'card surface'],
  ['.eos-evidence', 'evidence mark'],
  ["[data-state='estimated']", 'estimated evidence state'],
  ["[data-state='issue']", 'issue evidence state'],
  ['.eos-live-dot', 'live dot'],
  ['.eos-skeleton', 'skeleton'],
  ['.eos-draw', 'chart draw-in'],
  ['prefers-reduced-motion', 'reduced-motion block'],
] as const;

for (const [needle, label] of required) {
  check(`index.css defines the ${label}`, css.includes(needle));
}

check(
  'gradients are confined to moments and chart fills',
  (css.match(/gradient\(/g) ?? []).length <= 6 && !/\.eos-cta[^}]*gradient/.test(css),
);

// ── 3. Source scan: className strings only (never comments or imports) ──────
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

const classNamePattern = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
const BANNED: [RegExp, string][] = [
  [/\buppercase\b/, 'uppercase labels'],
  [/\bbg-gradient-to-|\bfrom-[a-z]+-\d|\bvia-[a-z]+-\d|\bto-[a-z]+-\d/, 'utility gradients'],
  [/\btransition-all\b/, 'transition-all'],
  [/\beos-(aura|grid|text-gradient|rule|drift)\b/, 'retired gradient helpers'],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'emoji'],
];

const offenders: string[] = [];
for (const file of walk(path.join(process.cwd(), 'src'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(classNamePattern)) {
    const value = match[1] ?? match[2] ?? '';
    for (const [pattern, label] of BANNED) {
      if (pattern.test(value)) {
        offenders.push(`${path.relative(process.cwd(), file)}: ${label} → ${value.slice(0, 80)}`);
        break;
      }
    }
  }
}

check('no banned classes in any className', offenders.length === 0, offenders.slice(0, 4).join(' | '));

// ── 4. Rendered primitives ──────────────────────────────────────────────────
const tones = ['solid', 'outline', 'muted', 'ghost', 'verified', 'estimated', 'issue', 'accent'] as const;

const primitives = renderToStaticMarkup(
  <div>
    {tones.map((tone) => (
      <Badge key={tone} tone={tone}>
        {tone}
      </Badge>
    ))}
    <StatCard label="Verified savings" value="£10,180" sub="vs baseline" trend={{ value: -11.1, goodWhenNegative: true }} />
    <ProgressBar value={42} tone="verified" />
    <Card>plain card</Card>
    <Card tone="ink">moment card</Card>
    <SectionHeading title="Evidence" subtitle="Every figure carries its state" />
    <EvidenceMark state="verified" label />
    <EvidenceMark state="estimated" evidence={{ inputs: ['a'], arithmetic: 'b', source: 'c' }} />
    <EmptyState title="Nothing yet" hint="Import a bill" />
  </div>,
);

check('badges use meaning tints', primitives.includes('bg-verified-tint') && primitives.includes('bg-estimated-tint') && primitives.includes('bg-issue-tint'));
check('accent is available as a tone', primitives.includes('bg-accent-tint'));
check('ink cards render the moment surface', primitives.includes('eos-moment'));
check('paper cards render the card surface', primitives.includes('eos-card'));
check('figures are set in mono', primitives.includes('font-mono'));
check('evidence renders both states', primitives.includes('data-state="verified"') && primitives.includes('data-state="estimated"'));
// A popover may reference the token; an ad-hoc rgba shadow is what we forbid.
check('shadows come from the token, never ad hoc', !/shadow-\[(?!var\()/.test(primitives));
check('no uppercase in rendered primitives', !/uppercase/.test(primitives));

// The audit screen must still lead with the saving and label its state.
const audit: AuditView = {
  score: 46,
  recoverableGbp: 128.49,
  findings: [
    { code: 'arithmetic', severity: 'high', title: 'The bill is £162.84 higher than kWh × rate + standing charge', detail: 'The itemised charges do not add up.', impactGbp: 162.84, recommendation: 'Ask for a corrected invoice.' },
  ],
  benchmark: {
    label: 'North Western England domestic reference',
    unitRateP: 26.49,
    standingChargeP: 45.68,
    consumptionKwh: 9200,
    periodDays: 31,
    actualTotalGbp: 2885,
    expectedTotalGbp: 2450,
    savingGbp: 435,
    savingPct: 15,
  } as AuditView['benchmark'],
  capLabel: '1 Oct – 31 Dec 2026',
  capUnitRateP: 26.32,
  regionName: 'North Western England',
  advice: null,
};

const screen = renderToStaticMarkup(<AuditResult audit={audit} />);
check('audit leads with the saving', screen.includes('£435'));
check('audit labels the saving as estimated', screen.includes('data-state="estimated"'));
check('audit does not call the cap a rule', !/Ofgem cap [0-9]/.test(screen));

console.log(failures === 0 ? '\ndesign rules v2 verified' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
