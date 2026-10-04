import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useClerk, useSignIn } from '@clerk/clerk-expo';
import { LogIn, Zap } from 'lucide-react-native';

import { useAuth } from './lib/auth';
import { Button } from './components/ui';
import { colors, font, fontWeight, radius, shadow, spacing } from './theme';

/** Presentational email/password form shared by the dev and Clerk sign-in flows. */
function CredentialsForm({
  email,
  password,
  setEmail,
  setPassword,
  error,
  busy,
  onSubmit,
  hint,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
  hint: string;
}) {
  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.brand}>
          <View style={s.logo}>
            <Zap size={22} color={colors.ink900} strokeWidth={2.6} />
          </View>
          <Text style={s.brandTitle}>EnerOS</Text>
          <Text style={s.brandSub}>Sign in to your energy console</Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor={colors.slate400}
            style={s.input}
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor={colors.slate400}
            style={s.input}
          />
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={{ marginTop: spacing.md }}>
          <Button
            label={busy ? 'Signing in…' : 'Sign in'}
            onPress={onSubmit}
            Icon={LogIn}
            full
            disabled={busy}
          />
        </View>

        <Text style={s.hint}>{hint}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Dev-mode sign-in — used only when Clerk is not configured. */
function DevSignIn() {
  const { config, signInWithPassword } = useAuth();
  const [email, setEmail] = useState(config.demo.email);
  const [password, setPassword] = useState(config.demo.password ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!signInWithPassword) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CredentialsForm
      email={email}
      password={password}
      setEmail={setEmail}
      setPassword={setPassword}
      error={error}
      busy={busy}
      onSubmit={submit}
      hint="Dev auth mode — Clerk is not configured. These demo credentials open the seeded workspace and are identical on web and mobile."
    />
  );
}

/** Clerk sign-in using the native password flow. */
function ClerkSignIn() {
  const { config } = useAuth();
  const { isLoaded, signIn } = useSignIn();
  const { setActive } = useClerk();
  const [email, setEmail] = useState(config.demo.email);
  const [password, setPassword] = useState(config.demo.password ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signIn.create({ identifier: email, password });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
      } else {
        setError('Additional verification is required for this account.');
      }
    } catch (err) {
      const message =
        (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
        (err instanceof Error ? err.message : 'Sign-in failed.');
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CredentialsForm
      email={email}
      password={password}
      setEmail={setEmail}
      setPassword={setPassword}
      error={error}
      busy={busy}
      onSubmit={submit}
      hint="Signed in with Clerk. Use the same demo credentials on web and mobile to see the same workspace."
    />
  );
}

/** Renders the sign-in UI until authenticated, then the app shell. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (!auth.isLoaded) {
    return (
      <View style={s.center}>
        <View style={s.logo}>
          <Zap size={22} color={colors.ink900} strokeWidth={2.6} />
        </View>
        <Text style={s.loading}>Connecting to EnerOS…</Text>
      </View>
    );
  }

  if (!auth.isSignedIn) {
    return auth.mode === 'clerk' ? <ClerkSignIn /> : <DevSignIn />;
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.slate100 },
  scroll: {
    padding: spacing['2xl'],
    paddingTop: spacing['3xl'],
    flexGrow: 1,
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate100,
    gap: spacing.md,
  },
  loading: { color: colors.slate500, fontSize: font.base },
  brand: { alignItems: 'center', marginBottom: spacing['2xl'], gap: 6 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.emerald500,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  brandTitle: { fontSize: font['2xl'], fontWeight: fontWeight.bold, color: colors.slate800 },
  brandSub: { fontSize: font.base, color: colors.slate500 },
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: font.sm,
    fontWeight: fontWeight.medium,
    color: colors.slate500,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.base,
    color: colors.slate800,
    backgroundColor: colors.white,
  },
  error: {
    color: colors.rose700,
    backgroundColor: colors.rose50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.sm,
    marginBottom: spacing.md,
  },
  hint: {
    marginTop: spacing.xl,
    fontSize: font.xs + 1,
    color: colors.slate400,
    textAlign: 'center',
    lineHeight: 17,
  },
});

