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

export default function AnalysisEmptyState() {
  return (
    <Card>
      <div className="grid place-items-center px-6 py-14 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-neutral-100">
          <Quote className="h-6 w-6 text-neutral-600" />
        </span>
        <p className="mt-4 text-sm font-semibold text-neutral-800">Enter a bill to start the audit</p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-neutral-600">
          The engine checks the unit rate and standing charge against Ofgem&rsquo;s cap for your
          region, re-adds the invoice arithmetic, verifies VAT treatment, and compares consumption
          with this site&rsquo;s own baseline.
        </p>
      </div>
    </Card>
  );
}
