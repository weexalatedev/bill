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

import {
  Fact,
  annualCostAt,
  field,
  labelCls,
  scoreTone,
  severityChip,
  severityTone,
  toQuery,
  emptyForm,
  type FormState,
} from './analysis/shared';
import BillUploadCard from './analysis/BillUploadCard';
import NarrationCard from './analysis/NarrationCard';
import AnalysisEmptyState from './analysis/AnalysisEmptyState';
import BillForm from './analysis/BillForm';
import FindingsCard from './analysis/FindingsCard';
import WeatherCard from './analysis/WeatherCard';
import BenchmarkCard from './analysis/BenchmarkCard';

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
                      <p className="mt-0.5 max-w-lg text-xs text-neutral-600">
                        A formal letter claiming {gbp(analysis.recoverableGbp)}. It quotes only the
                        proven findings and sets a 14-day deadline.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={downloadLetter}
                      disabled={letterBusy}
                      className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
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
