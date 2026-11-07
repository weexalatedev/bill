'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApp } from '../../store';
import FlowShell, { type FlowStep } from '../../components/flow/FlowShell';
import {
  clearAuditSummary,
  markOnboardingSkipped,
  readAuditSummary,
  wasOnboardingSkipped,
} from '../../lib/onboarding';
import SiteStep from './SiteStep';
import MoreSitesStep from './MoreSitesStep';
import DevicesStep from './DevicesStep';
import DoneStep from './DoneStep';
import { siteFormToDraft, type SiteFormValues } from './SiteFields';

type Step = 'site' | 'sites' | 'devices' | 'done';

const RAIL: FlowStep[] = [
  { label: 'Your site' },
  { label: 'Your devices' },
  { label: 'Dashboard' },
];

const RAIL_INDEX: Record<Step, number> = { site: 0, sites: 0, devices: 1, done: 2 };

const TITLES: Record<Step, string> = {
  site: 'Tell us about your site',
  sites: 'Any other sites?',
  devices: 'Connect your devices',
  done: "You're all set",
};

const SUBTITLES: Record<Step, string> = {
  site: 'This is what every bill is filed and benchmarked against. You can change any of it later.',
  sites:
    'Everything in EnerOS is per site — add the rest of your portfolio here, or skip and do it later.',
  devices:
    'Optional. Connect your energy provider and inverter and we can read your usage and tariff live.',
  done: 'Your workspace is ready — here is a quick look at what you set up.',
};

/**
 * The post-signup onboarding, as phase-wise screens: **site → more sites →
 * devices → dashboard**. Every phase is skippable; skipping still walks the user
 * through the remaining screens so the product explains itself before the console.
 */
export default function OnboardingFlow() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken, user } = useAuth();
  const { sites, addSite, loading } = useApp();

  const [step, setStep] = useState<Step>('site');
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(true);
  const [deviceCount, setDeviceCount] = useState(0);
  const [profileDraft, setProfileDraft] = useState({ companyName: '', postcode: '' });
  const [saving, setSaving] = useState<number | null>(null);
  const decided = useRef(false);

  // Decide exactly once whether this account still needs onboarding. We wait for
  // the workspace so an existing customer (who already has sites) is not walked
  // through setup again, and we latch the decision so adding a site mid-flow does
  // not bounce the user out.
  useEffect(() => {
    if (decided.current || !isLoaded) return;
    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }
    if (loading) return;
    decided.current = true;

    void (async () => {
      const auth = await getToken();
      if (!auth) {
        router.replace('/sign-in');
        return;
      }
      setToken(auth);
      if (sites.length > 0 || wasOnboardingSkipped()) {
        router.replace('/dashboard');
        return;
      }
      try {
        const { profile } = await api.getProfile(auth);
        if (profile.onboarded) {
          router.replace('/dashboard');
          return;
        }
      } catch {
        // A brand-new account has no profile yet — the empty flow is correct.
      }
      setSaving(readAuditSummary()?.savingGbp ?? null);
      setChecking(false);
    })();
  }, [isLoaded, isSignedIn, loading, getToken, router, sites.length]);

  const saveFirstSite = async (businessName: string, values: SiteFormValues) => {
    const draft = siteFormToDraft(values);
    await addSite(draft);
    setProfileDraft({ companyName: businessName, postcode: draft.postcode ?? '' });
    await api.saveProfile(token, {
      companyName: businessName,
      siteCount: 1,
      postcode: draft.postcode ?? '',
    });
    setStep('sites');
  };

  const addAnotherSite = async (values: SiteFormValues) => {
    await addSite(siteFormToDraft(values));
  };

  const finishSites = async () => {
    if (profileDraft.postcode) {
      try {
        await api.saveProfile(token, {
          companyName: profileDraft.companyName || 'My business',
          siteCount: Math.max(1, sites.length),
          postcode: profileDraft.postcode,
        });
      } catch {
        // Non-fatal — the sites themselves are already saved.
      }
    }
    setStep('devices');
  };

  const finish = () => {
    // The audit recap has served its purpose — drop it so it cannot leak into a
    // later session on a shared device.
    clearAuditSummary();
    markOnboardingSkipped();
    router.replace('/dashboard');
  };

  if (checking || !token) return <OnboardingSplash />;

  return (
    <FlowShell
      steps={RAIL}
      current={RAIL_INDEX[step]}
      eyebrow="Setting up your workspace"
      title={TITLES[step]}
      subtitle={SUBTITLES[step]}
    >
      {step === 'site' && (
        <SiteStep
          defaultCompanyName={user?.name ?? ''}
          saving={saving}
          onSubmit={saveFirstSite}
          onSkip={() => setStep('sites')}
        />
      )}

      {step === 'sites' && (
        <MoreSitesStep
          sites={sites}
          onAdd={addAnotherSite}
          onContinue={finishSites}
          onSkip={finishSites}
        />
      )}

      {step === 'devices' && (
        <DevicesStep
          token={token}
          homeId={sites[0]?.id ?? ''}
          onContinue={() => setStep('done')}
          onSkip={() => setStep('done')}
          onCountChange={setDeviceCount}
        />
      )}

      {step === 'done' && (
        <DoneStep
          siteCount={sites.length}
          deviceCount={deviceCount}
          saving={saving}
          onFinish={finish}
        />
      )}
    </FlowShell>
  );
}

/** Full-screen splash while auth + the workspace resolve. */
function OnboardingSplash() {
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-50">
      <div className="flex flex-col items-center gap-3 text-neutral-500">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-ink-900">
          <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Setting up your workspace…
        </p>
      </div>
    </div>
  );
}
