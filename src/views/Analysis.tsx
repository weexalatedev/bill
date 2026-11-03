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
import { useApp } from '../store';
import { useAuth } from '../lib/auth';
import {
  api,
  ApiError,
  type BillQuery,
  type CapPeriod,
  type CapRegion,
  type WeatherSummary,
  type AuditNarration,
  type IntakeResult,
} from '../lib/api';
import type { AnalysisFinding, BillAnalysis, FindingSeverity } from '../types';
import { Badge, Card, SectionHeading, StatCard, type Tone } from '../components/ui';
import { gbp, gbp2, pct, pence, signedGbp } from '../lib/format';
import { cx } from '../lib/cx';

const severityTone: Record<FindingSeverity, Tone> = {
  high: 'solid',
  medium: 'outline',
  low: 'muted',
  info: 'ghost',
};

/** The severity glyph behind each finding — same ramp as the badge. */
const severityChip: Record<FindingSeverity, string> = {
  high: 'bg-ink-900 text-white',
  medium: 'bg-white text-ink-900 ring-1 ring-inset ring-ink-900/20',
  low: 'bg-neutral-100 text-neutral-700',
  info: 'bg-transparent text-neutral-500 ring-1 ring-inset ring-neutral-200',
};

const field =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/12';
const labelCls = 'mb-1 block text-xs font-medium text-neutral-500';

interface FormState {
  supplier: string;
  periodStart: string;
  periodEnd: string;
  consumptionKwh: string;
  unitRateP: string;
  standingChargeP: string;
  totalGbp: string;
  vatGbp: string;
  nightShare: string;
  businessContract: boolean;
}

const emptyForm: FormState = {
  supplier: '',
  periodStart: '',
  periodEnd: '',
  consumptionKwh: '',
  unitRateP: '',
  standingChargeP: '',
  totalGbp: '',
  vatGbp: '',
  nightShare: '',
  businessContract: false,
};

/** Build the API payload, omitting anything the user left blank. */
function toQuery(form: FormState): BillQuery {
  const numOrUndef = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
  return {
    supplier: form.supplier.trim() || undefined,
    periodStart: form.periodStart || undefined,
    periodEnd: form.periodEnd || undefined,
    consumptionKwh: numOrUndef(form.consumptionKwh),
    unitRateP: numOrUndef(form.unitRateP),
    standingChargeP: numOrUndef(form.standingChargeP),
    totalGbp: numOrUndef(form.totalGbp),
    vatGbp: numOrUndef(form.vatGbp),
    nightShare: numOrUndef(form.nightShare),
    businessContract: form.businessContract || undefined,
    includeWeather: true,
  };
}

function scoreTone(score: number | undefined): Tone {
  if (score === undefined) return 'muted';
  if (score >= 85) return 'muted';
  if (score >= 60) return 'outline';
  return 'solid';
}

/** Indicative annual cost for a region at a given usage — makes rate gaps concrete. */
function annualCostAt(region: CapRegion, annualKwh: number): string {
  return gbp(Math.round((annualKwh * region.unitRateP) / 100 + region.standingChargeP * 365));
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-neutral-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

/**
 * /analysis — the Smart Analysis workbench.
 *
 * Everything here is computed by `server/src/lib/analysis.ts` against published
 * reference data. There is no demo dataset behind the findings: enter a real
 * bill and the engine tells you what is wrong with it, what it is worth, and
 * which licence condition to quote back at the supplier.
 */
export default function Analysis() {
  const { sites, pushToast } = useApp();
  const { getToken } = useAuth();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [siteId, setSiteId] = useState('');
  const [analysis, setAnalysis] = useState<BillAnalysis | null>(null);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narration, setNarration] = useState<AuditNarration | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [letterBusy, setLetterBusy] = useState(false);

  // AI paste-a-bill extraction (Gemini). The flag comes from the price-cap feed.
  const [extractionAvailable, setExtractionAvailable] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractionInfo, setExtractionInfo] = useState<{
    confidence: number;
    review: string[];
  } | null>(null);

  const [cap, setCap] = useState<{ period: CapPeriod; regions: CapRegion[] } | null>(null);
  const [region, setRegion] = useState<CapRegion | null>(null);
  const [postcode, setPostcode] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // The cap table is public and only changes quarterly.
  useEffect(() => {
    api
      .getPriceCap()
      .then((data) => {
        setCap(data);
        setExtractionAvailable(data.extractionAvailable);
      })
      .catch(() => undefined);
  }, []);

  // Prefill the postcode, and resolve the stored region id once the table loads.
  useEffect(() => {
    let cancelled = false;
    getToken()
      .then(async (token) => {
        if (!token) return;
        try {
          const { profile } = await api.getProfile(token);
          if (cancelled) return;
          if (profile.postcode) setPostcode(profile.postcode);
          const match = cap?.regions.find((r) => r.id === profile.regionId);
          if (match) setRegion(match);
        } catch {
          // No profile yet — the user can type a postcode instead.
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getToken, cap]);

  // Live postcode → region lookup, debounced.
  useEffect(() => {
    if (postcode.trim().length < 4) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getRegion(postcode)
        .then((data) => {
          if (!cancelled && data.region) setRegion(data.region);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [postcode]);

  const comparable = useMemo(
    () => (region && cap ? cap.regions.filter((r) => r.id !== region.id).slice(0, 3) : []),
    [region, cap],
  );

  /**
   * Run the deterministic engine, then automatically narrate the findings with
   * Gemini. Smart Analysis is AI-enabled by default — no button press needed.
   */
  const runWith = async (payload: BillQuery) => {
    setBusy(true);
    setError(null);
    setWeather(null);
    setNarration(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired — please sign in again.');
      const { analysis: result, weather: w } = await api.analyseBill(token, payload);
      setAnalysis(result);
      setWeather(w);
      // Fire the AI explanation; the deterministic findings stand on their own
      // if this fails, and the card says so honestly.
      setNarrating(true);
      try {
        const res = await api.narrateBill(token, payload);
        setNarration(res.narration);
      } catch {
        setNarration({ summary: '', actions: [], source: 'unavailable' });
      } finally {
        setNarrating(false);
      }
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof ApiError ? err.message : 'Could not analyse that bill.');
    } finally {
      setBusy(false);
    }
  };

  const run = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = toQuery(form);
    if (siteId) payload.siteId = siteId;
    return runWith(payload);
  };

  /**
   * Paste-a-bill: Gemini reads the raw invoice text, the form is filled with
   * exactly what the model found, and the audit + narration run immediately.
   */
  const extract = async () => {
    const text = pasteText.trim();
    if (text.length < 20 || extracting) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired — please sign in again.');
      const res = await api.extractBill(token, text);
      const e = (res.extracted ?? {}) as Record<string, unknown>;
      const str = (v: unknown): string => (typeof v === 'string' ? v : '');
      const num = (v: unknown): string =>
        typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
      const next: FormState = {
        supplier: str(e.supplier),
        periodStart: str(e.periodStart),
        periodEnd: str(e.periodEnd),
        consumptionKwh: num(e.consumptionKwh),
        unitRateP: num(e.unitRateP),
        standingChargeP: num(e.standingChargeP),
        totalGbp: num(e.totalGbp),
        vatGbp: num(e.vatGbp),
        nightShare: '',
        businessContract: false,
      };
      setForm(next);
      setExtractionInfo({
        confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
        review: Array.isArray(e.fieldsNeedingReview)
          ? e.fieldsNeedingReview.filter((f): f is string => typeof f === 'string')
          : [],
      });
      const payload = toQuery(next);
      if (siteId) payload.siteId = siteId;
      await runWith(payload);
    } catch (err) {
      setExtractError(
        err instanceof ApiError
          ? err.message
          : 'The extractor could not read that bill — try the manual form below.',
      );
    } finally {
      setExtracting(false);
    }
  };

  const narrate = async () => {
    if (!analysis) return;
    setNarrating(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('session expired');
      const payload = toQuery(form);
      if (siteId) payload.siteId = siteId;
      const res = await api.narrateBill(token, payload);
      setNarration(res.narration);
    } catch {
      setNarration({ summary: '', actions: [], source: 'unavailable' });
    } finally {
      setNarrating(false);
    }
  };

  /** Apply a PDF/text upload: fill the form and show findings + AI advice. */
  const applyUpload = (res: IntakeResult) => {
    const e = (res.extracted ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const num = (v: unknown): string =>
      typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
    setForm({
      supplier: str(e.supplier),
      periodStart: str(e.periodStart),
      periodEnd: str(e.periodEnd),
      consumptionKwh: num(e.consumptionKwh),
      unitRateP: num(e.unitRateP),
      standingChargeP: num(e.standingChargeP),
      totalGbp: num(e.totalGbp),
      vatGbp: num(e.vatGbp),
      nightShare: '',
      businessContract: false,
    });
    setAnalysis(res.analysis);
    setNarration(res.advice);
    setWeather(null);
    pushToast?.('Bill read — findings and advice ready.');
  };

  const downloadLetter = async () => {
    if (!analysis) return;
    setLetterBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('session expired');
      const payload = toQuery(form);
      if (siteId) payload.siteId = siteId;
      const res = await api.disputeLetter(token, payload);
      const blob = new Blob([res.letter.subject + '\n\n' + res.letter.body], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'EnerOS-dispute-letter.txt';
      a.click();
      URL.revokeObjectURL(url);
      pushToast?.(
        'Dispute letter ready — ' + gbp(res.letter.totalClaimedGbp) + ' claimed',
      );
    } catch (err) {
      pushToast?.(err instanceof ApiError ? err.message : 'Could not build the letter.');
    } finally {
      setLetterBusy(false);
    }
  };

return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Potential saving"
          value={analysis ? gbp(analysis.recoverableGbp) : '—'}
          sub={
            analysis
              ? form.totalGbp && Number(form.totalGbp) > 0
                ? `${pct((analysis.recoverableGbp / Number(form.totalGbp)) * 100)} of the bill · ${analysis.findings.length} findings`
                : `${analysis.findings.length} findings`
              : 'Run an analysis'
          }
          icon={<Scale className="h-5 w-5" />}
          tone={analysis && analysis.recoverableGbp > 0 ? 'solid' : 'muted'}
        />
        <StatCard
          label="Bill health score"
          value={analysis ? `${analysis.score}/100` : '—'}
          sub={analysis?.region?.name ?? 'No region resolved'}
          icon={<Gauge className="h-5 w-5" />}
          tone={scoreTone(analysis?.score)}
        />
        <StatCard
          label="Effective rate"
          value={analysis?.effectiveRateP ? pence(analysis.effectiveRateP, 2) : '—'}
          sub={cap ? `GB average ${pence(cap.period.averageUnitRateP, 2)}` : 'All-in cost per kWh'}
          icon={<Receipt className="h-5 w-5" />}
          tone="muted"
        />
        <StatCard
          label="Regional cap"
          value={
            region ? pence(region.unitRateP, 2) : cap ? pence(cap.period.averageUnitRateP, 2) : '—'
          }
          sub={cap?.period.label}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="solid"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <BillUploadCard siteId={siteId} onResult={applyUpload} />

        <BillForm
          form={form}
          set={set}
          siteId={siteId}
          setSiteId={setSiteId}
          sites={sites}
          busy={busy}
          error={error}
          onSubmit={run}
          onReset={() => {
            setForm(emptyForm);
            setAnalysis(null);
            setError(null);
            setNarration(null);
            setPasteText('');
            setExtractionInfo(null);
            setExtractError(null);
          }}
          ai={{
            available: extractionAvailable,
            text: pasteText,
            onText: setPasteText,
            extracting,
            error: extractError,
            info: extractionInfo,
            onExtract: extract,
          }}
        />

        <div className="space-y-6">
          {!analysis && !busy && <AnalysisEmptyState />}
          {analysis && (
            <>
              <NarrationCard
                narration={narration}
                narrating={narrating}
                onNarrate={narrate}
              />
              <FindingsCard analysis={analysis} />
              {analysis.findings.length > 0 && (
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Dispute letter</p>
                      <p className="mt-0.5 max-w-lg text-xs text-neutral-500">
                        A formal letter claiming {gbp(analysis.recoverableGbp)}. It quotes only the
                        proven findings and sets a 14-day deadline.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={downloadLetter}
                      disabled={letterBusy}
                      className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
                    >
                      {letterBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Download letter
                    </button>
                  </div>
                </Card>
              )}
              {weather && <WeatherCard weather={weather} />}
              <BenchmarkCard
                region={region}
                postcode={postcode}
                onPostcode={setPostcode}
                cap={cap}
                comparable={comparable}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BillUploadCard({
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
        <p className="mt-0.5 text-xs text-neutral-500">PDF, photo or text · up to 12 MB</p>
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

function NarrationCard({
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
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
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
            className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {narrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Quote className="h-4 w-4" />}
            {narrating ? 'Asking Gemini…' : 'Explain this audit'}
          </button>
          <span className="text-xs text-neutral-400">
            {unavailable
              ? 'Gemini is not configured or failed just now — set GEMINI_API_KEY on the API, then try again. The findings above are the deterministic engine.'
              : 'Runs automatically after every analysis.'}
          </span>
        </div>
      )}
    </Card>
  );
}

function AnalysisEmptyState() {
  return (
    <Card>
      <div className="grid place-items-center px-6 py-14 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-neutral-100">
          <Quote className="h-6 w-6 text-neutral-400" />
        </span>
        <p className="mt-4 text-sm font-semibold text-neutral-800">Enter a bill to start the audit</p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-neutral-500">
          The engine checks the unit rate and standing charge against Ofgem&rsquo;s cap for your
          region, re-adds the invoice arithmetic, verifies VAT treatment, and compares consumption
          with this site&rsquo;s own baseline.
        </p>
      </div>
    </Card>
  );
}
function BillForm({
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
          className="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/12"
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
function FindingsCard({ analysis }: { analysis: BillAnalysis }) {
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
                finding.impactGbp > 0 ? 'text-ink-900' : 'text-neutral-500',
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
              <dt className="text-neutral-500">{item.label}</dt>
              <dd className="text-right font-medium text-neutral-800">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 rounded-md bg-neutral-50 px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-700">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
            {finding.recommendation}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-neutral-400">
            <span>Source: {finding.source.replace(/-/g, ' ')}</span>
            <span>·</span>
            <span>Confidence {pct(finding.confidence * 100, 0)}</span>
          </p>
        </div>
      </div>
    </li>
  );
}

function WeatherCard({ weather }: { weather: WeatherSummary }) {
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
        <p className="flex items-start gap-2 text-xs leading-relaxed text-neutral-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {weather.note ?? 'No temperature data was returned.'} Findings above were still produced
          — they are simply not weather-adjusted.
        </p>
      )}
    </Card>
  );
}
function BenchmarkCard({
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
        title="Ofgem price cap benchmark"
        subtitle={cap?.period.source ?? 'Energy price cap unit rates and standing charges'}
        action={cap ? <Badge tone="muted">{cap.period.label}</Badge> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-neutral-400" />
          <span className="sr-only">Postcode</span>
          <input
            value={postcode}
            onChange={(e) => onPostcode(e.target.value.toUpperCase())}
            placeholder="Postcode"
            className="w-36 rounded-md border border-neutral-200 px-3 py-1.5 text-xs focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/12"
          />
        </label>
        {region ? (
          <span className="text-xs text-neutral-500">
            Benchmarking against <strong className="text-neutral-800">{region.name}</strong>
          </span>
        ) : (
          <span className="text-xs text-neutral-400">
            Add a postcode to benchmark against your own region rather than the GB average.
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-400">
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
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
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