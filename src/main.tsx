import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { Loader2, Zap } from 'lucide-react';
import App from './App.tsx';
import { AppProvider } from './store.tsx';
import { api, type ApiConfig } from './lib/api.ts';
import { ClerkAuthProvider, DevAuthProvider } from './lib/auth.tsx';
import { clerkAppearance } from './lib/clerkAppearance.ts';
import './index.css';

function BootScreen({ error }: { error?: string | null }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Zap className="h-5 w-5 text-ink-900" strokeWidth={2.5} />
        </div>
        {error ? (
          <div className="max-w-sm">
            <p className="text-sm font-semibold text-slate-800">Cannot reach the EnerOS API</p>
            <p className="mt-1 text-xs text-slate-500">{error}</p>
            <p className="mt-3 text-xs text-slate-400">
              Make sure the API is available at <code className="rounded bg-slate-200 px-1">/api</code>.
              For local development, start it with{' '}
              <code className="rounded bg-slate-200 px-1">cd server &amp;&amp; npm run dev</code>.
              For Vercel, check the server function logs and confirm <code className="rounded bg-slate-200 px-1">MONGODB_URI</code>{' '}
              is configured.
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting to EnerOS…
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Fetch the API config, then mount the app with the matching auth provider.
 *
 * The publishable key is read from `/api/config` rather than a build-time env
 * var so there is exactly one place to rotate it. `ClerkProvider` is mounted
 * *inside* `BrowserRouter` — Clerk's `routing="path"` components resolve against
 * React Router's location, which requires that ordering.
 */
function Bootstrap() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unknown error'));
  }, []);

  if (error) return <BootScreen error={error} />;
  if (!config) return <BootScreen />;

  const app = (
    <AppProvider>
      <App />
    </AppProvider>
  );

  if (config.authMode === 'clerk' && config.clerkPublishableKey) {
    return (
      <ClerkProvider
        publishableKey={config.clerkPublishableKey}
        appearance={clerkAppearance}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        afterSignOutUrl="/sign-in"
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/welcome"
      >
        <ClerkAuthProvider config={config}>{app}</ClerkAuthProvider>
      </ClerkProvider>
    );
  }

  return <DevAuthProvider config={config}>{app}</DevAuthProvider>;
}

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <Bootstrap />
    </BrowserRouter>
  </StrictMode>,
);
