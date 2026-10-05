import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { ArrowRight, Building2, Loader2, MapPin, Sparkles } from 'lucide-react';
import { api, ApiError, type CapRegion } from '../../lib/api';
import AuthShell from './AuthShell';
import { useAuth } from '../../lib/auth';
import { pence } from '../../lib/format';

const field =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20';
const label = 'mb-1.5 block text-xs font-semibold text-slate-600';

/**
 * /welcome — the one screen between sign-up and the console.
 *
 * It exists for a product reason, not an onboarding-flavour reason: the
 * postcode resolves the Ofgem cap region that every rate benchmark is drawn
 * against, and the site count sets the plan price. Collecting it here means the
 * first bill the customer uploads is already analysed against the right numbers.
 */
export default function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken, config } = useAuth();

  const [companyName, setCompanyName] = useState('');
  const [siteCount, setSiteCount] = useState('1');
  const [postcode, setPostcode] = useState('');
  const [region, setRegion] = useState<CapRegion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from whatever is already stored on the account.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const { profile } = await api.getProfile(token);
        if (cancelled) return;
        if (profile.companyName) setCompanyName(profile.companyName);
        if (profile.siteCount) setSiteCount(String(profile.siteCount));
        if (profile.postcode) setPostcode(profile.postcode);
      } catch {
        // A fresh account has no profile yet — the empty form is correct.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Debounced postcode → cap region lookup.
  useEffect(() => {
    if (postcode.trim().length < 4) {
      setRegion(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .getRegion(postcode)
        .then((data) => {
          if (!cancelled) setRegion(data.region);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [postcode]);

const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired — please sign in again.');
      await api.saveProfile(token, {
        companyName: companyName.trim() || user?.fullName || 'My business',
        siteCount: Number(siteCount) || 1,
        postcode: postcode.trim().toUpperCase(),
        regionId: region?.id,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Set up your workspace"
      subtitle="Two details and we can benchmark your bills properly."
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className={label}>Business name</span>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Harbour Hospitality Group"
              required
              minLength={2}
              className={`${field} pl-9`}
            />
          </div>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Sites to track</span>
            <input
              type="number"
              min={1}
              max={500}
              value={siteCount}
              onChange={(e) => setSiteCount(e.target.value)}
              required
              className={field}
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Plans are priced per site, per month.
            </span>
          </label>

          <label className="block">
            <span className={label}>Main site postcode</span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                placeholder="M1 1AA"
                required
                className={`${field} pl-9`}
              />
            </div>
          </label>
        </div>

        {region && (
          <div className="animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" />
              Benchmarking against {region.name}
            </p>
            <p className="mt-1 text-xs text-emerald-700/90">
              Ofgem cap {pence(region.unitRateP)}/kWh + {pence(region.standingChargeP)}/day
              standing charge. Every invoice you upload is checked against these figures.
            </p>
          </div>
        )}

        {!region && postcode.trim().length >= 4 && (
          <p className="text-xs text-slate-400">
            We could not match that postcode to a cap region — you can still continue, and set it
            per site later.
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {busy ? 'Setting up…' : 'Enter your console'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="w-full text-center text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          Skip for now
        </button>
      </form>

      {config.authMode === 'dev' && (
        <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Dev auth mode — Clerk is not configured on the API, so you are signed in with the demo
          account. Set <code className="rounded bg-amber-100 px-1">CLERK_PUBLISHABLE_KEY</code> and{' '}
          <code className="rounded bg-amber-100 px-1">CLERK_SECRET_KEY</code> on the server to use
          real accounts.
        </p>
      )}
    </AuthShell>
  );
}
