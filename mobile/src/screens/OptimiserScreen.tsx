import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ArrowRight,
  Battery,
  Car,
  Check,
  Flame,
  Play,
  Snowflake,
  Sparkles,
  Sun,
  Utensils,
  Wind,
  Zap,
} from 'lucide-react-native';

import { useApp } from '../store';
import type { ActionStatus, ControlMode } from '../types';
import {
  Badge,
  Button,
  Card,
  Chips,
  EmptyState,
  ProgressBar,
  SectionHeading,
  StatCard,
} from '../components/ui';
import { Screen, ScreenHeader, Row } from '../components/Layout';
import { gbp, pct } from '../lib/format';
import { colors, font, fontWeight, radius, spacing } from '../theme';
import type { IconComponent } from '../components/ui';

const assetIcon = (asset: string): IconComponent => {
  const key = asset.toLowerCase();
  if (key.includes('refriger')) return Snowflake;
  if (key.includes('hvac')) return Wind;
  if (key.includes('hot water')) return Flame;
  if (key.includes('ev')) return Car;
  if (key.includes('battery')) return Battery;
  if (key.includes('solar')) return Sun;
  if (key.includes('kitchen') || key.includes('oven')) return Utensils;
  return Zap;
};

const statusTone: Record<ActionStatus, 'slate' | 'sky' | 'emerald'> = {
  Recommended: 'slate',
  Approved: 'sky',
  Automated: 'emerald',
};

const MODES: Array<{ id: ControlMode; detail: string }> = [
  { id: 'Recommend', detail: 'EnerOS suggests — your team applies changes.' },
  { id: 'Approve', detail: 'EnerOS proposes — you approve each action.' },
  { id: 'Automate', detail: 'EnerOS executes approved categories itself.' },
];

export default function OptimiserScreen() {
  const { actions, controlMode, setControlMode, advanceAction, getSiteById, account } = useApp();
  const [statusFilter, setStatusFilter] = useState<'All' | ActionStatus>('All');

  const potential = actions.reduce((total, a) => total + a.monthlySaving, 0);
  const committed = actions
    .filter((a) => a.status !== 'Recommended')
    .reduce((total, a) => total + a.monthlySaving, 0);
  const automated = actions
    .filter((a) => a.status === 'Automated')
    .reduce((total, a) => total + a.monthlySaving, 0);

  const visible = actions.filter((a) => statusFilter === 'All' || a.status === statusFilter);

  return (
    <>
      <ScreenHeader
        title="Optimiser"
        subtitle="Module C · Scheduling & flexible load"
        Icon={Sparkles}
      />
      <Screen>
        <Row>
          <StatCard
            label="Identified savings"
            value={`${gbp(potential)}/mo`}
            Icon={Sparkles}
            tone="violet"
            sub={`${gbp(potential * 12)} annualised`}
            subTone="positive"
          />
          <StatCard
            label="Committed"
            value={`${gbp(committed)}/mo`}
            Icon={Check}
            tone="sky"
            sub={`${actions.filter((a) => a.status !== 'Recommended').length} approved or automated`}
          />
          <StatCard
            label="Automated"
            value={`${gbp(automated)}/mo`}
            Icon={Play}
            tone="emerald"
            sub="running without human input"
            subTone="positive"
          />
          <StatCard
            label="Performance fee"
            value={`${account.performanceFeePct}%`}
            Icon={Zap}
            tone="amber"
            sub="only on verified savings"
          />
        </Row>

        {/* Control mode — progressive trust */}
        <Card>
          <SectionHeading
            title="Control mode"
            subtitle="Trust is earned progressively: recommend, then approve, then automate."
            action={<Badge tone="sky">Active: {controlMode}</Badge>}
          />
          <View style={s.modeGrid}>
            {MODES.map((mode) => {
              const active = controlMode === mode.id;
              return (
                <Pressable
                  key={mode.id}
                  onPress={() => setControlMode(mode.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[s.mode, active && s.modeActive]}
                >
                  <View style={s.modeHead}>
                    <Text style={[s.modeTitle, active && s.modeTitleActive]}>{mode.id}</Text>
                    {active ? <Check size={16} color={colors.emerald600} strokeWidth={2.6} /> : null}
                  </View>
                  <Text style={s.modeDetail}>{mode.detail}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Recommended actions */}
        <Card>
          <SectionHeading
            title="Recommended actions"
            subtitle="Schedule change, modelled confidence and verified saving for each action."
          />

          <View style={{ marginBottom: spacing.md }}>
            <Chips
              options={['All', 'Recommended', 'Approved', 'Automated'] as const}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </View>

          <View style={{ gap: spacing.md }}>
            {visible.map((action) => {
              const Icon = assetIcon(action.asset);
              const site = getSiteById(action.siteId);
              return (
                <View key={action.id} style={s.action}>
                  <View style={s.actionTop}>
                    <View style={s.actionIcon}>
                      <Icon size={18} color={colors.emerald600} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.actionTitleRow}>
                        <Text style={s.actionTitle} numberOfLines={2}>
                          {action.title}
                        </Text>
                        <Badge tone={statusTone[action.status]}>{action.status}</Badge>
                      </View>
                      <Text style={s.actionMeta} numberOfLines={1}>
                        {site?.name} · {site?.city} · {action.asset}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.actionSaving}>{gbp(action.monthlySaving)}/mo</Text>
                      <Text style={s.actionSavingSub}>{gbp(action.monthlySaving * 12)}/yr</Text>
                    </View>
                  </View>

                  <View style={s.scheduleRow}>
                    <View style={s.scheduleFrom}>
                      <Text style={s.scheduleFromText}>{action.fromSchedule}</Text>
                    </View>
                    <ArrowRight size={14} color={colors.slate400} strokeWidth={2} />
                    <View style={s.scheduleTo}>
                      <Text style={s.scheduleToText}>{action.toSchedule}</Text>
                    </View>
                  </View>

                  <View style={s.confidenceRow}>
                    <View style={{ flex: 1 }}>
                      <ProgressBar
                        value={action.confidence * 100}
                        color={action.confidence >= 0.85 ? colors.emerald500 : colors.amber500}
                        height={6}
                      />
                    </View>
                    <Text style={s.confidenceText}>
                      {pct(action.confidence * 100, 0)} confidence
                    </Text>
                  </View>

                  <Text style={s.rationale}>{action.rationale}</Text>

                  {action.status === 'Recommended' ? (
                    <Button
                      label="Approve action"
                      onPress={() => advanceAction(action.id)}
                      variant="secondary"
                      Icon={Check}
                      size="sm"
                    />
                  ) : null}

                  {action.status === 'Approved' ? (
                    <Button
                      label="Let EnerOS automate this"
                      onPress={() => advanceAction(action.id)}
                      variant="primary"
                      Icon={Play}
                      size="sm"
                    />
                  ) : null}

                  {action.status === 'Automated' ? (
                    <View style={s.automatedRow}>
                      <Zap size={14} color={colors.emerald700} strokeWidth={2.2} />
                      <Text style={s.automatedText}>
                        EnerOS is controlling this asset automatically.
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {visible.length === 0 ? (
            <EmptyState
              Icon={Sparkles}
              title="No actions with this status"
              body="Try a different filter to see the rest of the queue."
            />
          ) : null}
        </Card>
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  modeGrid: { gap: spacing.sm },
  mode: {
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  modeActive: {
    borderColor: colors.emerald400,
    backgroundColor: colors.emerald50,
    shadowColor: colors.emerald500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  modeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeTitle: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate800 },
  modeTitleActive: { color: colors.emerald700 },
  modeDetail: { fontSize: font.xs + 1, color: colors.slate500, marginTop: 4, lineHeight: font.md + 4 },

  action: {
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(16,185,129,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  actionTitle: {
    fontSize: font.md,
    fontWeight: fontWeight.semibold,
    color: colors.slate800,
    flexShrink: 1,
  },
  actionMeta: { fontSize: font.xs + 1, color: colors.slate500, marginTop: 3 },
  actionSaving: { fontSize: font.md, fontWeight: fontWeight.bold, color: colors.slate800 },
  actionSavingSub: { fontSize: font.xs + 1, color: colors.slate400, marginTop: 2 },

  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  scheduleFrom: {
    backgroundColor: colors.slate100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  scheduleFromText: { fontSize: font.xs + 1, color: colors.slate600, fontWeight: fontWeight.medium },
  scheduleTo: {
    backgroundColor: colors.emerald50,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  scheduleToText: { fontSize: font.xs + 1, color: colors.emerald700, fontWeight: fontWeight.semibold },

  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  confidenceText: { fontSize: font.xs, color: colors.slate400 },
  rationale: { fontSize: font.sm, color: colors.slate500, lineHeight: font.md + 5 },

  automatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.emerald50,
    borderRadius: radius.md,
    padding: 10,
  },
  automatedText: { flex: 1, fontSize: font.sm, color: colors.emerald700 },
});


