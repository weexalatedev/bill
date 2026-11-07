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

export default function NarrationCard({
  narration,
  narrating,
  onNarrate,
}: {
  narration: AuditNarration | null;
  narrating: boolean;
  onNarrate: () => void;
}) {
  const unavailable = narration !== null && narration.source !== 'gemini';
  return (
    <Card>
      <SectionHeading
        title="Explanation"
        subtitle="Plain-English summary of the engine's findings. The engine decides; the summary explains."
        action={
          narration?.source === 'gemini' ? (
            <Badge tone="muted">Gemini</Badge>
          ) : unavailable ? (
            <Badge tone="outline">Unavailable</Badge>
          ) : null
        }
      />
      {narration?.summary ? (
        <div className="space-y-3">
          <div className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">
            {narration.summary}
          </div>
          {narration.actions.length > 0 && (
            <ul className="space-y-1.5">
              {narration.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
                  {action}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onNarrate}
            disabled={narrating}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {narrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Quote className="h-4 w-4" />}
            {narrating ? 'Asking Gemini…' : 'Explain this audit'}
          </button>
          <span className="text-xs text-neutral-600">
            {unavailable
              ? 'Gemini is not configured or failed just now — set GEMINI_API_KEY on the API, then try again. The findings above are the deterministic engine.'
              : 'Runs automatically after every analysis.'}
          </span>
        </div>
      )}
    </Card>
  );
}
