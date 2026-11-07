import { redirect } from 'next/navigation';

/** Logical alias from the brief; the console keeps `/settings`. */
export default function SettingsAlias() {
  redirect('/settings');
}
