import type { ComponentType, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, font, fontWeight, radius, shadow, spacing, status, type StatusTone } from '../theme';

// Theme keys the shared components rely on; `transparent` lets buttons opt out of a fill.
export const TRANSPARENT = 'transparent';

/** A lucide icon component — accepts size/color/strokeWidth. */
export type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/* ------------------------------------------------------------------ Badge */

export function Badge({
  tone = 'slate',
  children,
  Icon,
}: {
  tone?: StatusTone;
  children: ReactNode;
  Icon?: IconComponent;
}) {
  const t = status[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={12} color={t.fg} strokeWidth={2.4} /> : null}
      <Text style={[s.badgeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------- Card */

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[s.card, padded && s.cardPadded, style]}>{children}</View>;
}

/* -------------------------------------------------------- Section heading */

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.headingRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.headingTitle}>{title}</Text>
        {subtitle ? <Text style={s.headingSub}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

/* ------------------------------------------------------------ Progress bar */

export function ProgressBar({
  value,
  track = colors.slate200,
  color = colors.emerald500,
  height = 8,
}: {
  value: number;
  track?: string;
  color?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={[s.track, { backgroundColor: track, height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${clamped}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/* --------------------------------------------------------------- Status dot */

export function StatusDot({ tone }: { tone: StatusTone }) {
  const t = status[tone];
  return (
    <View style={s.dotWrap}>
      <View style={[s.dot, { backgroundColor: t.dot }]} />
    </View>
  );
}

/* --------------------------------------------------------------- StatCard */

export function StatCard({
  label,
  value,
  sub,
  Icon,
  tone = 'slate',
  subTone = 'muted',
}: {
  label: string;
  value: string;
  sub?: string;
  Icon?: IconComponent;
  tone?: StatusTone;
  /** Controls the colour of the supporting line. */
  subTone?: 'muted' | 'positive' | 'negative';
}) {
  const subColor =
    subTone === 'positive' ? colors.emerald700 : subTone === 'negative' ? colors.rose600 : colors.slate500;
  return (
    <View style={s.statCard}>
      <View style={s.statHead}>
        <Text style={s.statLabel} numberOfLines={1}>
          {label}
        </Text>
        {Icon ? <Icon size={15} color={colors.slate400} strokeWidth={2} /> : null}
      </View>
      <Text style={s.statValue} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={[s.statSub, { color: subColor }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      <View style={[s.statAccent, { backgroundColor: status[tone].dot }]} />
    </View>
  );
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  Icon,
  title,
  body,
  action,
}: {
  Icon: IconComponent;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Icon size={22} color={colors.slate400} strokeWidth={1.8} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

/* ---------------------------------------------------------------- Segmented */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Text
            key={opt}
            onPress={() => onChange(opt)}
            style={[s.segmentItem, active && s.segmentItemActive]}
          >
            {opt}
          </Text>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------- Button */

export function Button({
  label,
  onPress,
  variant = 'primary',
  Icon,
  size = 'md',
  full,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  Icon?: IconComponent;
  size?: 'sm' | 'md';
  full?: boolean;
  disabled?: boolean;
}) {
  const palette = {
    primary: { bg: colors.ink900, fg: colors.white, border: colors.ink900 },
    secondary: { bg: colors.white, fg: colors.slate700, border: colors.slate300 },
    ghost: { bg: TRANSPARENT, fg: colors.slate600, border: TRANSPARENT },
    danger: { bg: colors.rose600, fg: colors.white, border: colors.rose600 },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        size === 'sm' && s.btnSm,
        full && { alignSelf: 'stretch' },
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[s.btnText, size === 'sm' && s.btnTextSm, { color: palette.fg }]}>{label}</Text>
      {Icon ? <Icon size={size === 'sm' ? 13 : 15} color={palette.fg} strokeWidth={2.2} /> : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------- TextInput */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.slate400}
        keyboardType={keyboardType}
        style={s.input}
      />
    </View>
  );
}

/* -------------------------------------------------------------- Chip select */

/**
 * Horizontal scrollable chip picker — the mobile stand-in for a `<select>`.
 * Keeps every option reachable without a modal or extra dependency.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labels?: Record<string, string>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.chipsRow}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[s.chip, active && s.chipActive]}
          >
            <Text numberOfLines={1} style={[s.chipText, active && s.chipTextActive]}>
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ----------------------------------------------------------------- Styles */

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: font.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    ...shadow.card,
  },
  cardPadded: { padding: spacing.lg },

  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headingTitle: {
    fontSize: font.base,
    fontWeight: fontWeight.bold,
    color: colors.slate800,
    letterSpacing: -0.2,
  },
  headingSub: {
    fontSize: font.xs + 1,
    color: colors.slate500,
    marginTop: 2,
    lineHeight: font.md,
  },

  track: { width: '100%', overflow: 'hidden' },

  dotWrap: { width: 8, height: 8, borderRadius: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  statCard: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  statHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 6,
  },
  statLabel: {
    flex: 1,
    fontSize: font.xs,
    color: colors.slate500,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: font.xl,
    fontWeight: fontWeight.bold,
    color: colors.slate800,
    letterSpacing: -0.6,
  },
  statSub: { fontSize: font.xs + 1, marginTop: 3 },
  statAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: font.base,
    fontWeight: fontWeight.bold,
    color: colors.slate700,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: font.sm,
    color: colors.slate500,
    textAlign: 'center',
    lineHeight: font.md + 6,
    maxWidth: 300,
  },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.slate200,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
    alignSelf: 'flex-start',
  },
  segmentItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    fontSize: font.sm,
    color: colors.slate600,
    fontWeight: fontWeight.medium,
    overflow: 'hidden',
  },
  segmentItemActive: {
    backgroundColor: colors.white,
    color: colors.slate800,
    fontWeight: fontWeight.semibold,
  },

  chipsRow: { gap: spacing.sm, paddingRight: spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.slate50,
    maxWidth: 220,
  },
  chipActive: { backgroundColor: colors.ink900, borderColor: colors.ink900 },
  chipText: { fontSize: font.sm, color: colors.slate600, fontWeight: fontWeight.medium },
  chipTextActive: { color: colors.white, fontWeight: fontWeight.semibold },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    alignSelf: 'flex-start',
  },
  btnSm: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  btnText: { fontSize: font.md, fontWeight: fontWeight.semibold, letterSpacing: -0.1 },
  btnTextSm: { fontSize: font.sm },

  fieldLabel: {
    fontSize: font.xs,
    fontWeight: fontWeight.semibold,
    color: colors.slate500,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.md,
    color: colors.slate800,
    backgroundColor: colors.white,
  },
});
