'use client';

import Layout from '@/components/Layout';
import SubscriptionGate from '@/components/SubscriptionGate';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <SubscriptionGate>
      <Layout>{children}</Layout>
    </SubscriptionGate>
  );
}
