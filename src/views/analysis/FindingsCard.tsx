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

export default function FindingsCard({ analysis }: { analysis: BillAnalysis }) {
  const count = analysis.findings.length;
  return (
    <Card>
      <SectionHeading
        title="Findings"
        subtitle={`${count} check${count === 1 ? '' : 's'} raised · ${gbp(
          analysis.recoverableGbp,
        )} recoverable`}
        action={
          count === 0 ? (
            <Badge tone="solid">
              <CheckCircle2 className="h-3 w-3" /> Clean
            </Badge>
          ) : (
            <Badge tone={severityTone[analysis.findings[0].severity]}>{count} raised</Badge>
          )
        }
      />

      {count === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-3 text-sm text-neutral-700">
          <CheckCircle2 className="h-4 w-4" />
          Nothing found. Every check the available data supports passed.
        </div>
      ) : (
        <ul className="space-y-3">
          {analysis.findings.map((finding) => (
            <FindingRow key={finding.code} finding={finding} />
          ))}
        </ul>
      )}

      <dl className="mt-5 grid gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-4">
        <Fact label="Period" value={analysis.periodDays ? `${analysis.periodDays} days` : '—'} />
        <Fact
          label="Expected total"
          value={analysis.expectedTotalGbp ? gbp2(analysis.expectedTotalGbp) : '—'}
        />
        <Fact
          label="Effective rate"
          value={analysis.effectiveRateP ? `${pence(analysis.effectiveRateP, 2)}/kWh` : '—'}
        />
        <Fact label="Cap period" value={analysis.capPeriod.label} />
      </dl>
    </Card>
  );
}

function FindingRow({ finding }: { finding: AnalysisFinding }) {
  return (
    <li className="rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              'grid h-7 w-7 shrink-0 place-items-center rounded-md',
              severityChip[finding.severity],
            )}
          >
            {finding.severity === 'info' ? (
              <Info className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </span>
          <p className="text-sm font-semibold text-neutral-900">{finding.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {finding.impactGbp !== 0 && (
            <span
              className={cx(
                'text-sm font-semibold',
                finding.impactGbp > 0 ? 'text-ink-900' : 'text-neutral-600',
              )}
            >
              {signedGbp(finding.impactGbp)}
            </span>
          )}
          <Badge tone={severityTone[finding.severity]}>{finding.severity}</Badge>
        </div>
      </div>

      <p className="mt-2 pl-9 text-xs leading-relaxed text-neutral-600">{finding.detail}</p>

      <div className="mt-3 pl-9">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {finding.evidence.map((item) => (
            <div key={item.label} className="flex justify-between gap-3 text-xs">
              <dt className="text-neutral-600">{item.label}</dt>
              <dd className="text-right font-medium text-neutral-800">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-700">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
            {finding.recommendation}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-neutral-600">
            <span>Source: {finding.source.replace(/-/g, ' ')}</span>
            <span>·</span>
            <span>Confidence {pct(finding.confidence * 100, 0)}</span>
          </p>
        </div>
      </div>
    </li>
  );
}
