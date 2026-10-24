import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import { api, ApiError, type IntakeResult } from '../lib/api';
import { Badge, Card, type Tone } from '../components/ui';
import { gbp, gbp2, pence } from '../lib/format';
import { cx } from '../lib/cx';

const severityTone: Record<string, Tone> = { high: 'rose', medium: 'amber', low: 'sky', info: 'slate' };
type Stage = 'upload' | 'reading' | 'result';
const STEPS = ['Upload your bill', 'Read the audit', 'See how to save'];

export default function GetStarted() {
  const [stage, setStage] = useState<Stage>('upload');
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStage('reading');
    try {
      const res = await api.publicBillCheckFile(file);
      if (res.ok && res.analysis) {
        setResult(res);
        setStage('result');
      } else {
        setResult(res);
        setError(res.note ?? 'We could not read that bill. Try a different file.');
        setStage('upload');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not read that file just now.');
      setStage('upload');
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setStage('upload');
  };

  const analysis = result?.analysis;
  const advice = result?.advice;
  const findings = analysis?.findings ?? [];
  const stepIndex = stage === 'result' ? 2 : stage === 'reading' ? 1 : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-sm">
              <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
            </span>
            <span className="text-sm font-bold text-slate-900">EnerOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/check" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Enter manually
            </Link>
            <Link
              to="/sign-in"
              className="rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <ol className="mb-8 flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cx(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                  i < stepIndex
                    ? 'bg-emerald-600 text-white'
                    : i === stepIndex
                      ? 'bg-ink-900 text-white'
                      : 'bg-slate-200 text-slate-500',
                )}
              >
                {i < stepIndex ? '✓' : i + 1}
              </span>
              <span className={cx('truncate', i <= stepIndex ? 'text-slate-800' : 'text-slate-400')}>
                {label}
              </span>
            </li>
          ))}
        </ol>

        {stage === 'upload' && (
          <Card>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Upload a bill — get a cost-saving plan
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              We read the PDF, re-check every line against Ofgem reference rates, then tell you what
              to do to save money. No account needed.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                upload(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileRef.current?.click()}
              className={cx(
                'mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                dragging
                  ? 'border-emerald-400 bg-emerald-50/60'
                  : 'border-slate-200 bg-slate-50/60 hover:border-emerald-300',
              )}
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                <Upload className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">Drop your electricity bill here</p>
              <p className="mt-1 text-xs text-slate-500">PDF or text · up to 12 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.csv,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </div>

            {error && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              A PDF exported from your supplier portal works best. Prefer typing it in?{' '}
              <Link to="/check" className="font-medium text-emerald-700 underline">
                Use the manual checker
              </Link>
              .
            </p>
          </Card>
        )}

        {stage === 'reading' && (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="mt-4 text-sm font-semibold text-slate-900">Reading your bill…</p>
            <p className="mt-1 text-xs text-slate-500">
              Extracting the figures, checking the arithmetic, and writing your plan.
            </p>
          </Card>
        )}


        {stage === 'result' && analysis && (
          <div className="space-y-4">
            <Card className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Potentially recoverable</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                  {gbp2(analysis.recoverableGbp)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {findings.length} finding{findings.length === 1 ? '' : 's'}
                  {analysis.region ? ` · benchmarked against ${analysis.region.name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {advice?.estimatedAnnualSavingGbp ? (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Annual opportunity</p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {gbp(advice.estimatedAnnualSavingGbp)}
                    </p>
                  </div>
                ) : null}
                <div className="text-right">
                  <p className="text-xs text-slate-400">Bill health</p>
                  <p
                    className={cx(
                      'text-2xl font-bold',
                      analysis.score >= 85
                        ? 'text-emerald-600'
                        : analysis.score >= 60
                          ? 'text-amber-600'
                          : 'text-rose-600',
                    )}
                  >
                    {analysis.score}/100
                  </p>
                  {analysis.effectiveRateP !== null && (
                    <p className="text-xs text-slate-400">
                      {pence(analysis.effectiveRateP, 2)}/kWh all-in
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-slate-900">Your cost-saving plan</p>
                {advice?.source === 'gemini' ? (
                  <Badge tone="violet">AI</Badge>
                ) : (
                  <Badge tone="slate">findings only</Badge>
                )}
              </div>
              {advice && advice.summary ? (
                <>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {advice.summary}
                  </p>
                  {advice.actions.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {advice.actions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  The written advice is unavailable right now — the findings below still show what to
                  challenge.
                </p>
              )}
            </Card>


            <Card>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">What we found</p>
                <Badge tone="slate">Ofgem cap {pence(analysis.capPeriod.averageUnitRateP, 2)}</Badge>
              </div>
              {findings.length === 0 ? (
                <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Nothing obvious — the bill
                  reconciles.
                </p>
              ) : (
                <ul className="space-y-3">
                  {findings.map((f, i) => (
                    <li key={`${f.code}-${i}`} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <Badge tone={severityTone[f.severity] ?? 'slate'}>{f.severity}</Badge>
                          <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                        </div>
                        {Math.abs(f.impactGbp) > 0 && (
                          <span className="shrink-0 font-mono text-sm font-semibold text-slate-800">
                            {gbp(f.impactGbp)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{f.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="bg-ink-900 text-white">
              <p className="text-sm font-semibold">Keep this working for you</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                EnerOS monitors half-hourly usage, finds overnight waste, and verifies the savings —
                from £49 per site per month.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/sign-up"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-ink-900 hover:bg-emerald-400"
                >
                  Create a free account <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Check another bill
                </button>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

