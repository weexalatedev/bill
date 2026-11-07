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

export default function WeatherCard({ weather }: { weather: WeatherSummary }) {
  return (
    <Card>
      <SectionHeading
        title="Weather normalisation"
        subtitle="Half-hourly air temperature from Elexon, used to separate seasonal effects from real anomalies."
        action={
          weather.normalised ? (
            <Badge tone="solid">Adjusted</Badge>
          ) : (
            <Badge tone="muted">Unavailable</Badge>
          )
        }
      />
      {weather.normalised ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label="Mean temperature" value={`${weather.meanTempC}°C`} icon={<Thermometer />} />
          <Fact label="Heating degree days" value={String(weather.degreeDays ?? '—')} />
          <Fact label="Balance point" value="15.5°C" />
        </div>
      ) : (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {weather.note ?? 'No temperature data was returned.'} Findings above were still produced
          — they are simply not weather-adjusted.
        </p>
      )}
    </Card>
  );
}
