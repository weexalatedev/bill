import { Suspense } from 'react';
import PaymentStep from '@/views/onboarding/PaymentStep';

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-sm text-neutral-600">
          Loading payment…
        </div>
      }
    >
      <PaymentStep />
    </Suspense>
  );
}
