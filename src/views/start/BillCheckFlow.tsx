'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Keyboard, Loader2, PiggyBank, ShieldCheck, Upload, Zap } from 'lucide-react';
import { api, ApiError, type IntakeResult, type PublicBillCheck } from '../../lib/api';
import { Card } from '../../components/ui';
import FlowShell, { type FlowStep } from '../../components/flow/FlowShell';
import { gbp } from '../../lib/format';
import { writeAuditSummary, type AuditSummary } from '../../lib/onboarding';
import AuditResult, { type AuditView } from './AuditResult';
import BillForm, { type BillFormValues, toBillPayload } from './BillForm';
import UploadBill from './UploadBill';

/** The screens of the public acquisition flow. */
type Step = 'intro' | 'upload' | 'manual' | 'reading' | 'audit' | 'account';

/** The rail shown in the header — the branch (upload vs type) sits under step 1. */
const RAIL: FlowStep[] = [
  { label: 'Your bill' },
  { label: 'Your audit' },
  { label: 'Create account' },
];

const RAIL_INDEX: Record<Step, number> = {
  intro: 0,
  upload: 0,
  manual: 0,
  reading: 1,
  audit: 1,
  account: 2,
};

const TITLES: Record<Step, string> = {
  intro: 'Check your energy bill',
  upload: 'Upload your bill',
  manual: 'Enter your bill',
  reading: 'Auditing your bill…',
  audit: 'Your audit',
  account: 'Create an account to save money',
};

const SUBTITLES: Record<Step, string> = {
  intro:
    'Drop in a bill and we will price it against the UK median rate in seconds. No account, nothing stored.',
  upload: 'A PDF or a photo of the bill — we read it, with OCR for scans.',
  manual: 'Type the figures from your latest bill and we will do the rest.',
  reading: 'Checking the unit rate, the standing charge and the arithmetic.',
  audit: 'Here is what your bill should have cost — and what you could save.',
  account: 'Your audit is ready to be saved to a site and watched every month.',
};

/**
 * The public acquisition flow: **check a bill → see the saving → create an
 * account**. It replaces the old "three tabs under the login form" entry point:
 * each phase is its own full screen, and the sign-in/up screens are reached only
 * once the visitor has seen money on the table.
 */
export default function BillCheckFlow() {
  const [step, setStep] = useState<Step>('intro');
  const [audit, setAudit] = useState<AuditView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postcode, setPostcode] = useState('');

  const reset = () => {
    setAudit(null);
    setError(null);
    setBusy(false);
    setStep('intro');
  };

  const checkManual = async (values: BillFormValues) => {
    setError(null);
    setBusy(true);
    setStep('reading');
    try {
      const result = await api.publicBillCheck(toBillPayload(values));
      const view = viewFromPublic(result);
      setAudit(view);
      writeAuditSummary(summarise(view, values.supplier.trim() || undefined));
      setStep('audit');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'We could not check that bill just now. Please try again.',
      );
      setStep('manual');
    } finally {
      setBusy(false);
    }
  };

  const checkFile = async (file: File) => {
    setError(null);
    setBusy(true);
    setStep('reading');
    try {
      const result = await api.publicBillCheckFile(file, postcode.trim() || undefined);
      if (result.ok && result.analysis) {
        const view = viewFromIntake(result) as AuditView;
        setAudit(view);
        writeAuditSummary(summarise(view));
        setStep('audit');
      } else {
        setError(
          result.note ??
            'We could not read that bill. Try a different file, or type the figures in instead.',
        );
        setStep('upload');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not read that file just now.');
      setStep('upload');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 'upload' || step === 'manual' || step === 'audit') setStep('intro');
  };

  return (
    <FlowShell
      steps={RAIL}
      current={RAIL_INDEX[step]}
      eyebrow={step === 'account' ? 'Almost there' : 'Free bill check'}
      title={TITLES[step]}
      subtitle={SUBTITLES[step]}
      onBack={step === 'upload' || step === 'manual' || step === 'audit' ? back : undefined}
      aside={
        <Link
          href="/sign-in"
          className="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
        >
          Sign in
        </Link>
      }
    >
      {step === 'intro' && (
        <IntroStep onUpload={() => setStep('upload')} onManual={() => setStep('manual')} />
      )}

      {step === 'upload' && (
        <UploadBill
          busy={busy}
          error={error}
          postcode={postcode}
          onPostcodeChange={setPostcode}
          onFile={checkFile}
          onSwitchToManual={() => {
            setError(null);
            setStep('manual');
          }}
        />
      )}

      {step === 'manual' && (
        <BillForm
          busy={busy}
          error={error}
          onSubmit={checkManual}
          onSwitchToUpload={() => {
            setError(null);
            setStep('upload');
          }}
        />
      )}

      {step === 'reading' && <ReadingStep />}

      {step === 'audit' && audit && (
        <AuditResult
          audit={audit}
          footer={
            <Card tone="ink" className="eos-aura overflow-hidden">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <PiggyBank className="h-4 w-4 text-neutral-300" />
                {canSave(audit)
                  ? `Save ${gbp(audit.benchmark?.savingGbp ?? 0)} — and every bill after it`
                  : 'Keep this working for you'}
              </p>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-neutral-300">
                EnerOS stores this audit against your site, re-checks every future bill against the
                same UK reference rate, and verifies the money you recover — from £49 per site per
                month.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep('account')}
                  className="eos-cta-light inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold"
                >
                  Create an account to save money <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Check another bill
                </button>
              </div>
            </Card>
          }
        />
      )}

      {step === 'account' && audit && <AccountStep audit={audit} onBack={() => setStep('audit')} />}
    </FlowShell>
  );
}

// ── Normalisers: both intake paths become one AuditView ────────────────────────

function viewFromPublic(result: PublicBillCheck): AuditView {
  return {
    score: result.score,
    recoverableGbp: result.recoverableGbp,
    findings: result.findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      impactGbp: finding.impactGbp,
      recommendation: finding.recommendation,
    })),
    benchmark: result.benchmark,
    capLabel: result.capPeriod.label,
    capUnitRateP: result.capPeriod.averageUnitRateP,
    regionName: result.region?.name ?? null,
    advice: null,
    note: result.note,
  };
}

function viewFromIntake(result: IntakeResult): AuditView | null {
  const analysis = result.analysis;
  if (!analysis) return null;
  return {
    score: analysis.score,
    recoverableGbp: analysis.recoverableGbp,
    findings: analysis.findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      impactGbp: finding.impactGbp,
      recommendation: finding.recommendation,
    })),
    benchmark: analysis.benchmark,
    capLabel: analysis.capPeriod.label,
    capUnitRateP: analysis.capPeriod.averageUnitRateP,
    regionName: analysis.region?.name ?? null,
    advice:
      result.advice && result.advice.source !== 'unavailable'
        ? { summary: result.advice.summary, actions: result.advice.actions }
        : null,
    note: result.note,
  };
}

/** The handful of numbers the onboarding screens quote from this audit. */
function summarise(view: AuditView, supplier?: string): AuditSummary {
  return {
    recoverableGbp: view.recoverableGbp,
    actualTotalGbp: view.benchmark?.actualTotalGbp ?? null,
    benchmarkTotalGbp: view.benchmark?.expectedTotalGbp ?? null,
    savingGbp: view.benchmark?.savingGbp ?? null,
    benchmarkLabel: view.benchmark?.label ?? 'Domestic reference (Ofgem cap)',
    score: view.score,
    supplier,
  };
}

/** True when the audit found a real saving to shout about. */
function canSave(view: AuditView): boolean {
  return (view.benchmark?.savingGbp ?? 0) > 0.5;
}

// ── Screens ────────────────────────────────────────────────────────────────────

/** Step 1: "ask for a bill" — the visitor chooses how to hand it over. */
function IntroStep({ onUpload, onManual }: { onUpload: () => void; onManual: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={onUpload}
          className="group flex flex-col rounded-xl border-2 border-neutral-300 bg-white p-6 text-left shadow-sm transition-colors hover:border-neutral-400 hover:bg-neutral-50/40"
        >
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
            <Upload className="h-5 w-5" />
          </span>
          <span className="mt-4 text-base font-semibold text-neutral-900">Upload your bill</span>
          <span className="mt-1 text-sm leading-relaxed text-neutral-600">
            A PDF or a photo — we read the figures for you, even from a scan.
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
            Start with a file <ArrowRight className="h-4 w-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={onManual}
          className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
            <Keyboard className="h-5 w-5" />
          </span>
          <span className="mt-4 text-base font-semibold text-neutral-900">Enter the figures</span>
          <span className="mt-1 text-sm leading-relaxed text-neutral-600">
            Type the numbers from your bill — quickest if you have it open in front of you.
          </span>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600">
            Type it in <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      <Card className="flex items-start gap-3 bg-neutral-50/70">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
        <div>
          <p className="text-sm font-semibold text-neutral-800">What we check</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-600">
            Your charged unit rate and standing charge against your contract, the bill&apos;s own
            arithmetic and the VAT treatment — with the published domestic reference shown as a
            labelled benchmark, never as a rule your contract must meet.
          </p>
        </div>
      </Card>
    </div>
  );
}

/** The transient screen shown while the engine runs. */
function ReadingStep() {
  return (
    <Card className="flex flex-col items-center gap-4 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink-900">
        <Loader2 className="h-5 w-5 animate-spin text-white" />
      </span>
      <div>
        <p className="text-sm font-semibold text-neutral-800">Running the audit</p>
        <p className="mt-1 text-xs text-neutral-600">
          Reading the bill, benchmarking it against your contract and the domestic reference, and
          totalling what you could save.
        </p>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-neutral-600">
        <Zap className="h-3.5 w-3.5" /> Deterministic — the engine decides, nothing is guessed.
      </p>
    </Card>
  );
}

/** Step 3: the "create an account to save money" screen. */
function AccountStep({ audit, onBack }: { audit: AuditView; onBack: () => void }) {
  const saving = audit.benchmark?.savingGbp ?? null;
  const canSaveMoney = saving !== null && saving > 0.5;
  return (
    <div className="space-y-4">
      <Card tone="ink" className="eos-aura overflow-hidden">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-white">
          <PiggyBank className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">
          {canSaveMoney
            ? `Create an account to save ${gbp(saving ?? 0)}`
            : 'Create your free account'}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-300">
          {canSaveMoney
            ? `Your bill is ${gbp(saving ?? 0)} above what the UK median rate says it should be. An account saves this audit to your site and keeps checking every bill that follows.`
            : 'An account saves this audit to your site and keeps checking every bill that follows.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/sign-up"
            className="eos-cta-light inline-flex items-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold"
          >
            Create a free account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            I already have an account
          </Link>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-neutral-900">What happens next</p>
        <ol className="mt-3 space-y-3">
          {[
            ['Tell us about your site', 'Name, postcode and a couple of details — 30 seconds.'],
            ['Add more sites if you have them', 'Everything is filed and benchmarked per site.'],
            ['Connect your devices', 'Your energy provider and inverter, if you want live data.'],
          ].map(([title, detail], index) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-neutral-800">{title}</span>
                <span className="block text-xs text-neutral-600">{detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-600"
        >
          ← Back to my audit
        </button>
      </Card>
    </div>
  );
}
