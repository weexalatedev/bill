import { redirect } from 'next/navigation';

/**
 * `/welcome` was the single post-signup step. It is now the first phase of the
 * fuller onboarding flow at `/onboarding`; this redirect keeps the old Clerk
 * redirect targets working.
 */
export default function WelcomeRedirect() {
  redirect('/onboarding');
}

