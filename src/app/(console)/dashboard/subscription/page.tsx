import { redirect } from 'next/navigation';

/** Logical alias route from the brief; the console keeps `/subscription`. */
export default function SubscriptionAlias() {
  redirect('/subscription');
}
