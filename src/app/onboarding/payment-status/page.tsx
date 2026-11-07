import { Suspense } from 'react';
import PaymentStatus from '@/views/onboarding/PaymentStatus';

export default function PaymentStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-sm text-neutral-600">
          Checking payment…
        </div>
      }
    >
      <PaymentStatus />
    </Suspense>
  );
}
