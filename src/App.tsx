import { Navigate, Route, Routes } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import Layout from './components/Layout';
import AuthGate from './components/AuthGate';
import { ClerkFailed, ClerkGate } from './components/auth/ClerkStates';
import Dashboard from './pages/Dashboard';
import Bills from './pages/Bills';
import Analysis from './pages/Analysis';
import Optimiser from './pages/Optimiser';
import Sites from './pages/Sites';
import Copilot from './pages/Copilot';
import Live from './pages/Live';
import Plans from './pages/Plans';
import SignInPage from './pages/auth/SignInPage';
import SignUpPage from './pages/auth/SignUpPage';
import WelcomePage from './pages/auth/WelcomePage';
import PublicBillCheck from './pages/PublicBillCheck';
import Data from './pages/Data';

/**
 * Route map.
 *
 * Auth is Clerk-only. The sign-up and login screens are real routes rather than
 * an inline modal, so they can be linked to from a landing page, bookmarked,
 * shared in a support email and safely refreshed — including Clerk's own
 * sub-routes such as `/sign-up/verify-email/:code`, which the `/*` segments
 * below hand off to the hosted component.
 *
 *   • signed out → `/sign-in` or `/sign-up`; every other URL redirects to sign-in
 *   • signed in  → `/welcome` (onboarding) and the console
 *
 * `AuthGate` is the single gate for the console itself. It reads the unified
 * `useAuth()` surface, so it behaves identically in Clerk mode and in dev-auth
 * mode (no Clerk keys on the API), where Clerk's session primitives are not
 * the source of truth.
 */
export default function App() {
  return (
    <Routes>
      {/* Public auth routes — a signed-in visitor never sees these. */}
      <Route
        path="/sign-in/*"
        element={
          <SignedOut>
            <SignInPage />
          </SignedOut>
        }
      />
      <Route
        path="/sign-up/*"
        element={
          <SignedOut>
            <SignUpPage />
          </SignedOut>
        }
      />

      {/* Free bill check — public, no account required (the acquisition wedge). */}
      <Route path="/check" element={<PublicBillCheck />} />

      {/* Post-sign-up onboarding. Captures the postcode that sets the cap region. */}
      <Route
        path="/welcome"
        element={
          <SignedIn>
            <ClerkGate>
              <WelcomePage />
            </ClerkGate>
          </SignedIn>
        }
      />

      {/* The console — every page inside is behind AuthGate. */}
      <Route
        element={
          <AuthGate>
            <Layout />
          </AuthGate>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="bills" element={<Bills />} />
        <Route path="analysis" element={<Analysis />} />
        <Route path="optimiser" element={<Optimiser />} />
        <Route path="sites" element={<Sites />} />
        <Route path="data" element={<Data />} />
        <Route path="copilot" element={<Copilot />} />
        <Route path="live" element={<Live />} />
        <Route path="plans" element={<Plans />} />
      </Route>

      {/* Anything else: signed-in users go home, everyone else to sign in. */}
      <Route
        path="*"
        element={
          <>
            <SignedIn>
              <Navigate to="/" replace />
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
            <ClerkGate>
              <ClerkFailed />
            </ClerkGate>
          </>
        }
      />
    </Routes>
  );
}