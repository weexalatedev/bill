import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, RefreshCw, Zap } from 'lucide-react-native';

import { useApp } from '../store';
import { colors, font, fontWeight, radius, shadow, spacing } from '../theme';

/**
 * Blocks the tab shell until the workspace has loaded (and offers a retry if the
 * API is unreachable), so screens never render with an empty dataset.
 */
export default function DataGate({ children }: { children: React.ReactNode }) {
  const { sites, loading, error, refresh } = useApp();

  if (loading && sites.length === 0) {
    return (
      <View style={s.center}>
        <View style={s.logo}>
          <Zap size={22} color={colors.ink900} strokeWidth={2.6} />
        </View>
        <ActivityIndicator color={colors.emerald600} />
        <Text style={s.text}>Loading your energy workspace…</Text>
      </View>
    );
  }

  if (error && sites.length === 0) {
    return (
      <View style={s.center}>
        <AlertTriangle size={26} color={colors.amber600} />
        <Text style={s.title}>Could not load your data</Text>
        <Text style={s.text}>{error}</Text>
        <Pressable style={s.retry} onPress={() => void refresh()}>
          <RefreshCw size={15} color={colors.white} strokeWidth={2.2} />
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate100,
    padding: spacing['2xl'],
    gap: spacing.sm,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.emerald500,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  title: { fontSize: font.lg, fontWeight: fontWeight.bold, color: colors.slate800 },
  text: { fontSize: font.base, color: colors.slate500, textAlign: 'center' },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink900,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.md,
  },
  retryText: { color: colors.white, fontSize: font.base, fontWeight: fontWeight.semibold },
});
