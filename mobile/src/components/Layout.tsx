import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { colors, font, fontWeight, radius, shadow, spacing } from '../theme';
import { useApp } from '../store';
import type { IconComponent } from './ui';

/**
 * Dark chrome header, mirroring the web app's sidebar identity on a phone
 * viewport. The top inset is applied manually because the header paints
 * edge-to-edge behind the status bar.
 */
export function ScreenHeader({
  title,
  subtitle,
  right,
  Icon,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  Icon?: IconComponent;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
      <View style={s.headerBrand}>
        <View style={s.logo}>
          <Text style={s.logoText}>E</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{title}</Text>
          {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
      {Icon ? (
        <View style={s.headerIcon}>
          <Icon size={18} color={colors.slate300} strokeWidth={2} />
        </View>
      ) : null}
    </View>
  );
}

/** Screen container — light canvas with sensible gutters. */
export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!scroll) {
    return <View style={[s.canvas, s.scrollPad, style]}>{children}</View>;
  }
  return (
    <View style={[s.canvas, style]}>
      <ScrollView
        contentContainerStyle={s.scrollPad}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Row of equal-width cards with a fixed gap. */
export function Row({ children, gap = spacing.md }: { children: ReactNode; gap?: number }) {
  return <View style={[s.row, { gap }]}>{children}</View>;
}

/** Floating confirmation toast, shown above the tab bar. */
export function ToastHost() {
  const { toast } = useApp();
  const insets = useSafeAreaInsets();
  if (!toast) return null;

  return (
    <View pointerEvents="none" style={[s.toastWrap, { bottom: insets.bottom + 74 }]}>
      <View style={s.toast}>
        <View style={s.toastIcon}>
          <Check size={11} color={colors.white} strokeWidth={3} />
        </View>
        <Text style={s.toastText}>{toast}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: colors.ink900,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    ...shadow.float,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.emerald500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.ink950, fontSize: font.lg, fontWeight: fontWeight.bold },
  headerTitle: { color: colors.white, fontSize: font.xl, fontWeight: fontWeight.bold, letterSpacing: -0.5 },
  headerSub: { color: colors.slate400, fontSize: font.xs + 1, marginTop: 2 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.ink750,
    alignItems: 'center',
    justifyContent: 'center',
  },

  canvas: { flex: 1, backgroundColor: colors.slate100 },
  scrollPad: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },

  row: { flexDirection: 'row', flexWrap: 'wrap' },

  toastWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink850,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    maxWidth: '100%',
    ...shadow.float,
  },
  toastIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.emerald500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    color: colors.white,
    fontSize: font.sm,
    fontWeight: fontWeight.medium,
    flexShrink: 1,
  },
});
