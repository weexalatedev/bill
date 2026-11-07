import { redirect } from 'next/navigation';

/** Logical alias route from the brief; billing + history live at `/subscription`. */
export default function BillingAlias() {
  redirect('/subscription');
}
