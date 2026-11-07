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

export default function BillUploadCard({
  siteId,
  onResult,
}: {
  siteId?: string;
  onResult: (r: IntakeResult) => void;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('session expired');
      const res = await api.analyseFile(token, file, siteId || undefined);
      if (res.ok && res.analysis) onResult(res);
      else setError(res.note ?? 'We could not read that bill.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeading
        title="Upload a bill"
        subtitle="PDF, photo or text — we read it (with OCR if needed), audit it, and write cost-saving advice."
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void pick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => ref.current?.click()}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          drag ? 'border-neutral-400 bg-neutral-50/60' : 'border-neutral-200 bg-neutral-50/60 hover:border-neutral-300',
        )}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
        ) : (
          <Upload className="h-6 w-6 text-neutral-600" />
        )}
        <p className="mt-2 text-sm font-semibold text-neutral-900">
          {busy ? 'Reading your bill…' : 'Drop a PDF here or click to choose'}
        </p>
        <p className="mt-0.5 text-xs text-neutral-600">PDF, photo or text · up to 12 MB</p>
        <input
          ref={ref}
          type="file"
          accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.webp,.heic,application/pdf,text/plain,image/*"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </Card>
  );
}
