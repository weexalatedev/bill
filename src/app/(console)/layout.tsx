'use client';

import AuthGate from '@/components/AuthGate';
import Layout from '@/components/Layout';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Layout>{children}</Layout>
    </AuthGate>
  );
}
