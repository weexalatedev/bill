import { redirect } from 'next/navigation';

/**
 * The upload flow now lives in one continuous journey at `/start`. Kept as a
 * redirect so old links keep working.
 */
export default function GetStartedRedirect() {
  redirect('/start');
}

