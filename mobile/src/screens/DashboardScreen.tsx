import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Gauge, PiggyBank, ShieldCheck, TrendingDown } from 'lucide-react-native';

import { useApp } from '../store';
import { Badge, Card, SectionHeading, StatCard } from '../components/ui';
import { Screen, ScreenHeader, Row } from '../components/Layout';
import { Bars, ChartLegend, SpendChart } from '../components/charts';
import { gbp, pct, signedGbp } from '../lib/format';
import { colors, font, fontWeight, spacing } from '../theme';

export default function DashboardScreen() {
  const { account, sites, monthly, assetMix, metrics, actions, invoices, getSiteById } = useApp();

  const mixTotal = assetMix.reduce((total, slice) => total + slice.spend, 0);
  const topSites = [...sites].sort((a, b) => b.monthActual - a.monthActual).slice(0, 6);

  const findings = [
    ...invoices
      .filter((inv) => inv.status === 'Flagged')
      .flatMap((inv) =>
        inv.issues.map((issue) => ({
          id: `${inv.id}-${issue.type}`,
          tone: 'rose' as const,
          title: issue.type,
          detail: issue.detail,
          meta: `${getSiteById(inv.siteId)?.name ?? inv.siteId} · ${inv.id}`,
          value: issue.impact,
        })),
      ),
    ...actions
      .filter((a) => a.status === 'Automated')
      .slice(0, 2)
      .map((a) => ({
        id: a.id,
        tone: 'emerald' as const,
        title: a.title,
        detail: a.rationale,
        meta: `${getSiteById(a.siteId)?.name ?? a.siteId} · ${a.asset}`,
        value: a.monthlySaving,
      })),
  ];

  const steps: [string, string][] = [
    ['Baseline', 'Model each site for 12 months before intervention.'],
    ['Intervention', 'Apply approved actions and record every change.'],
    ['Measured outcome', 'Compare normalised usage against the baseline.'],
  ];

  return (
    <>
      <ScreenHeader title="EnerOS" subtitle={`${account.name} · ${account.sites} sites · Mar 2026`} Icon={ShieldCheck} />
      <Screen>
        <View style={s.inlineBetween}>
          <Badge tone="emerald" Icon={ShieldCheck}>
            Savings measured, not estimated
          </Badge>
        </View>

        {/* KPI grid */}
        <Row>
          <StatCard
            label="Spend this month"
            value={gbp(metrics.spendActual)}
            Icon={Gauge}
            tone="sky"
            sub={`${metrics.momChangePct <= 0 ? '' : '+'}${pct(metrics.momChangePct)} vs last month`}
            subTone={metrics.momChangePct <= 0 ? 'positive' : 'negative'}
          />
          <StatCard
            label="Expected spend"
            value={gbp(metrics.spendExpected)}
            Icon={TrendingDown}
            tone="slate"
            sub="baseline before optimisation"
          />
          <StatCard
            label="Verified savings"
            value={gbp(metrics.savings)}
            Icon={PiggyBank}
            tone="emerald"
            sub={`${pct(metrics.savingsRate)} below baseline`}
            subTone="positive"
          />
          <StatCard
            label="Bill issues open"
            value={String(metrics.issuesOpen)}
            Icon={AlertTriangle}
            tone="rose"
            sub={`${gbp(metrics.issuesValue)} recoverable`}
            subTone="negative"
          />
        </Row>

        {/* Spend chart */}
        <Card>
          <SectionHeading
            title="Spend vs expected baseline"
            subtitle="Baseline → intervention → measured outcome. Trailing 12 months."
          />
          <SpendChart data={monthly} />
          <ChartLegend
            items={[
              { label: 'Expected', color: colors.slate400, dashed: true },
              { label: 'Actual', color: colors.emerald500 },
            ]}
          />
        </Card>

        {/* Asset mix + top sites */}
        <Card>
          <SectionHeading
            title="Where the money goes"
            subtitle="This month's spend split by controllable asset."
          />
          <Bars data={assetMix} />
        </Card>

        <Card>
          <SectionHeading
            title="Spend by site"
            subtitle="Highest-consuming sites this month."
            action={<Badge tone="sky">Top 6 of {sites.length}</Badge>}
          />
          <View style={{ gap: spacing.sm }}>
            {topSites.map((site) => {
              const saving = site.monthExpected - site.monthActual;
              return (
                <View key={site.id} style={s.siteRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.siteName} numberOfLines={1}>
                      {site.name} · {site.city}
                    </Text>
                    <Text style={s.siteMeta} numberOfLines={1}>
                      {site.type} · {gbp(site.annualSpend)}/yr · {site.meterType}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.siteSpend}>{gbp(site.monthActual)}</Text>
                    <Text style={s.siteSaving}>saved {signedGbp(saving)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {/* AI findings */}
        <Card>
          <SectionHeading
            title="Latest AI findings"
            subtitle="Anomalies, bill issues and actions the Energy Brain has taken."
          />
          <View style={{ gap: spacing.md }}>
            {findings.slice(0, 6).map((item) => (
              <View key={item.id} style={s.finding}>
                <View
                  style={[
                    s.findingDot,
                    { backgroundColor: item.tone === 'rose' ? colors.rose500 : colors.emerald500 },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.findingHead}>
                    <Text style={s.findingTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Badge tone={item.tone}>{item.tone === 'rose' ? 'Issue' : 'Automated'}</Badge>
                  </View>
                  <Text style={s.findingDetail}>{item.detail}</Text>
                  <Text style={s.findingMeta} numberOfLines={1}>
                    {item.meta}
                  </Text>
                </View>
                <Text style={s.findingValue}>{signedGbp(item.value)}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Measurement methodology */}
        <View style={s.darkCard}>
          <View style={s.darkPill}>
            <ShieldCheck size={13} color={colors.emerald400} strokeWidth={2.2} />
            <Text style={s.darkPillText}>Measurement methodology</Text>
          </View>
          <Text style={s.darkTitle}>How savings are verified</Text>

          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {steps.map(([step, detail], index) => (
              <View key={step} style={s.step}>
                <View style={s.stepNum}>
                  <Text style={s.stepNumText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepTitle}>{step}</Text>
                  <Text style={s.stepDetail}>{detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={s.darkNote}>
            <Text style={s.darkNoteText}>
              {gbp(metrics.automatedSaving)}/month already automated · {gbp(metrics.potentialMonthlySaving)}
              /month identified in total. You only pay a {account.performanceFeePct}% performance fee
              on verified savings.
            </Text>
          </View>
        </View>
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  inlineBetween: { alignItems: 'flex-start' },

  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate100,
    backgroundColor: colors.slate50,
    padding: spacing.md,
  },
  siteName: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate800 },
  siteMeta: { fontSize: font.xs + 1, color: colors.slate500, marginTop: 2 },
  siteSpend: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate800 },
  siteSaving: { fontSize: font.xs + 1, color: colors.emerald600, marginTop: 2 },

  finding: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  findingDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  findingHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  findingTitle: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate800, flexShrink: 1 },
  findingDetail: { fontSize: font.md, color: colors.slate500, marginTop: 3, lineHeight: font.md + 6 },
  findingMeta: { fontSize: font.xs, color: colors.slate400, marginTop: 4 },
  findingValue: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate700 },

  darkCard: {
    backgroundColor: colors.ink900,
    borderRadius: 18,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  darkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    marginBottom: spacing.xs,
  },
  darkPillText: { fontSize: font.xs, fontWeight: fontWeight.semibold, color: colors.emerald400 },
  darkTitle: { fontSize: font.lg, fontWeight: fontWeight.bold, color: colors.white },

  step: { flexDirection: 'row', gap: spacing.sm },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: font.xs, fontWeight: fontWeight.bold, color: colors.emerald400 },
  stepTitle: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.white },
  stepDetail: { fontSize: font.xs + 1, color: colors.slate400, marginTop: 2, lineHeight: font.md },

  darkNote: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: spacing.md,
  },
  darkNoteText: { fontSize: font.xs + 1, color: colors.slate300, lineHeight: font.md + 5 },
});
