'use client';

import { useEffect, useState } from 'react';
import { ClerkProvider } from '@clerk/clerk-react';
import { Loader2, Zap } from 'lucide-react';
import { AppProvider } from '@/store';
import { api, type ApiConfig } from '@/lib/api';
import { ClerkAuthProvider, DevAuthProvider } from '@/lib/auth';
import { clerkAppearance } from '@/lib/clerkAppearance';

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

export default function Providers({ children }: { children: React.ReactNode }) {
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

  const app = <AppProvider>{children}</AppProvider>;

  if (config.authMode === 'clerk' && config.clerkPublishableKey) {
    return (
      <ClerkProvider
        publishableKey={config.clerkPublishableKey}
        appearance={clerkAppearance}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        afterSignOutUrl="/start"
        signInFallbackRedirectUrl="/onboarding"
        signUpFallbackRedirectUrl="/onboarding"
      >
        <ClerkAuthProvider config={config}>{app}</ClerkAuthProvider>
      </ClerkProvider>
    );
  }

  return <DevAuthProvider config={config}>{app}</DevAuthProvider>;
}
