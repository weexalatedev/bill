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

export default function BenchmarkCard({
  region,
  postcode,
  onPostcode,
  cap,
  comparable,
}: {
  region: CapRegion | null;
  postcode: string;
  onPostcode: (value: string) => void;
  cap: { period: CapPeriod; regions: CapRegion[] } | null;
  comparable: CapRegion[];
}) {
  const rows = region ? [region, ...comparable] : (cap?.regions.slice(0, 6) ?? []);

  return (
    <Card>
      <SectionHeading
        title="Domestic reference benchmark"
        subtitle={cap?.period.source ?? 'Energy price cap unit rates and standing charges'}
        action={cap ? <Badge tone="muted">{cap.period.label}</Badge> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-neutral-600" />
          <span className="sr-only">Postcode</span>
          <input
            value={postcode}
            onChange={(e) => onPostcode(e.target.value.toUpperCase())}
            placeholder="Postcode"
            className="w-36 rounded-md border border-neutral-200 px-3 py-1.5 text-xs focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/12"
          />
        </label>
        {region ? (
          <span className="text-xs text-neutral-600">
            Benchmarking against <strong className="text-neutral-800">{region.name}</strong>
          </span>
        ) : (
          <span className="text-xs text-neutral-600">
            Add a postcode to benchmark against your own region rather than the GB average.
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs tracking-wide text-neutral-600">
              <th className="pb-2 font-semibold">Region</th>
              <th className="pb-2 text-right font-semibold">Unit rate</th>
              <th className="pb-2 text-right font-semibold">Standing charge</th>
              <th className="pb-2 text-right font-semibold">£/yr @ 20M kWh</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.id === region?.id ? 'bg-neutral-50/50' : undefined}>
                <td className="py-2 font-medium text-neutral-800">
                  {r.name}
                  {r.id === region?.id && (
                    <Badge tone="solid" className="ml-2">
                      yours
                    </Badge>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-xs text-neutral-700">
                  {pence(r.unitRateP, 2)}
                </td>
                <td className="py-2 text-right tabular-nums text-xs text-neutral-700">
                  {pence(r.standingChargeP, 2)}
                </td>
                <td className="py-2 text-right tabular-nums text-xs text-neutral-700">
                  {annualCostAt(r, 20_000)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cap && (
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
          GB average {pence(cap.period.averageUnitRateP, 2)}/kWh and{' '}
          {pence(cap.period.averageStandingChargeP, 2)}/day standing charge,{' '}
          {cap.period.changePct >= 0 ? 'up ' : 'down '}
          {Math.abs(cap.period.changePct).toFixed(1)}% on the previous quarter
          {cap.period.electricityVatPct === 0
            ? '. VAT is currently removed from domestic electricity — a bill that still shows VAT in this window is worth querying.'
            : `, with electricity VAT at ${cap.period.electricityVatPct}%.`}
        </p>
      )}
    </Card>
  );
}
