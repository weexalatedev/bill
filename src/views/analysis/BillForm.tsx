'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Upload,
  CheckCircle2,
  FlaskConical,
  Gauge,
  Info,
  Loader2,
  MapPin,
  Quote,
  Receipt,
  Scale,
  ShieldCheck,
  Thermometer,
} from 'lucide-react';
import { useApp } from '../../store';
import { useAuth } from '../../lib/auth';
import {
  api,
  ApiError,
  type BillQuery,
  type CapPeriod,
  type CapRegion,
  type WeatherSummary,
  type AuditNarration,
  type IntakeResult,
} from '../../lib/api';
import type { AnalysisFinding, BillAnalysis, FindingSeverity } from '../../types';
import { Badge, Card, SectionHeading, StatCard, type Tone } from '../../components/ui';
import { gbp, gbp2, pct, pence, signedGbp } from '../../lib/format';
import { cx } from '../../lib/cx';
import { Fact, annualCostAt, emptyForm, field, labelCls, scoreTone, severityChip, severityTone, toQuery, type FormState } from './shared';

export default function BillForm({
  form,
  set,
  siteId,
  setSiteId,
  sites,
  busy,
  error,
  onSubmit,
  onReset,
  ai,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  siteId: string;
  setSiteId: (value: string) => void;
  sites: { id: string; name: string; type: string }[];
  busy: boolean;
  error: string | null;
  onSubmit: (event: React.FormEvent) => void;
  onReset: () => void;
  ai: {
    available: boolean;
    text: string;
    onText: (value: string) => void;
    extracting: boolean;
    error: string | null;
    info: { confidence: number; review: string[] } | null;
    onExtract: () => void;
  };
}) {
  const text = (
    key: keyof FormState,
    placeholder: string,
    extra: Record<string, unknown> = {},
  ) => (
    <input
      type="number"
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      placeholder={placeholder}
      className={field}
      min={0}
      step="any"
      {...extra}
    />
  );

  const date = (key: 'periodStart' | 'periodEnd') => (
    <input
      type="date"
      value={form[key]}
      onChange={(e) => set(key, e.target.value)}
      className={field}
    />
  );

  return (
    <Card>
      <SectionHeading
        title="Analyse a bill"
        subtitle="Paste a bill to fill the fields automatically, or type them in — the engine runs whichever checks the data supports."
      />

      {/* Paste-a-bill extraction — the model reads the raw invoice and fills the form. */}
      <div className="mb-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/40 p-3.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
          <Quote className="h-3.5 w-3.5" />
          Paste a bill — extract the figures
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-700/80">
          Paste the raw text of an electricity invoice. Gemini reads exactly what is printed,
          fills the fields below, and the engine audits it immediately.
        </p>
        <textarea
          value={ai.text}
          onChange={(e) => ai.onText(e.target.value)}
          rows={4}
          placeholder={
            'e.g.\nOctopus Energy Business — Invoice\nPeriod 01/09/2026 – 30/09/2026\n12,480 kWh @ 26.49p/kWh\nStanding charge 45.68p/day\nTotal incl. VAT £3,300.00'
          }
          className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-600 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/12"
        />
        {ai.info && (
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-800">
            Extracted at {Math.round(ai.info.confidence * 100)}% confidence.
            {ai.info.review.length > 0
              ? ` Worth a glance: ${ai.info.review.join(', ')}.`
              : ' All fields read cleanly.'}
          </p>
        )}
        {ai.error && (
          <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700">
            {ai.error}
          </p>
        )}
        <button
          type="button"
          onClick={ai.onExtract}
          disabled={ai.extracting || ai.text.trim().length < 20}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ai.extracting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Quote className="h-4 w-4" />
          )}
          {ai.extracting ? 'Reading the bill…' : 'Extract & analyse'}
        </button>
        {!ai.available && (
          <p className="mt-2 text-[11px] text-neutral-600">
            Gemini is not configured on the API yet (set GEMINI_API_KEY) — extraction will be
            refused; use the form below.
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-3.5">
        <label className="block">
          <span className={labelCls}>Supplier</span>
          <input
            value={form.supplier}
            onChange={(e) => set('supplier', e.target.value)}
            placeholder="e.g. Octopus Energy Business"
            className={field}
          />
        </label>

        <label className="block">
          <span className={labelCls}>Site — enables baseline checks</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={field}>
            <option value="">No specific site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} · {site.type}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Period start</span>
            {date('periodStart')}
          </label>
          <label className="block">
            <span className={labelCls}>Period end</span>
            {date('periodEnd')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Consumption (kWh)</span>
            {text('consumptionKwh', '12480')}
          </label>
          <label className="block">
            <span className={labelCls}>Unit rate (p/kWh)</span>
            {text('unitRateP', '26.49')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Standing charge (p/day)</span>
            {text('standingChargeP', '45.68')}
          </label>
          <label className="block">
            <span className={labelCls}>Total charged (£)</span>
            {text('totalGbp', '3300.00')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>VAT charged (£)</span>
            {text('vatGbp', '0.00')}
          </label>
          <label className="block">
            <span className={labelCls}>Off-peak share (0–1)</span>
            {text('nightShare', '0.35', { max: 1, step: '0.01' })}
          </label>
        </div>

        <label className="flex items-start gap-2.5 rounded-md bg-neutral-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={form.businessContract}
            onChange={(e) => set('businessContract', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-600 focus:ring-neutral-500"
          />
          <span className="text-xs leading-relaxed text-neutral-600">
            This site is on an unregulated <strong>business contract</strong>. Business rates are not
            capped, so cap findings become advisory and the VAT check is skipped.
          </span>
        </label>

        {error && (
          <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {busy ? 'Analysing…' : 'Run analysis'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            Reset
          </button>
        </div>
      </form>
    </Card>
  );
}
