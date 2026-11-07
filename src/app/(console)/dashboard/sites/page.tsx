import { redirect } from 'next/navigation';

/** Logical alias from the brief; the console keeps `/sites`. */
export default function SitesAlias() {
  redirect('/sites');
}
