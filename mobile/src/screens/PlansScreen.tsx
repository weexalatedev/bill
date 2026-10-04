import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Calculator, Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react-native';

import { useApp } from '../store';
import { Badge, Button, Card, SectionHeading, StatCard } from '../components/ui';
import { Screen, ScreenHeader, Row } from '../components/Layout';
import AccountCard from '../components/AccountCard';
import { gbp } from '../lib/format';
import { colors, font, fontWeight, radius, spacing } from '../theme';

export default function PlansScreen() {
  const { plans, account, sites, metrics, pushToast } = useApp();

  const currentPlan = plans.find((p) => p.id === account.planId) ?? plans[0];
  const siteCount = sites.length;
  const monthlySub = siteCount * currentPlan.pricePerSite;
  const annualSub = monthlySub * 12;
  const annualSavings = Math.round(metrics.savings * 12);
  const flexibilityGross = 60000;
  const flexibilityShare = Math.round((flexibilityGross * account.flexibilitySharePct) / 100);

  const [verifiedSavings, setVerifiedSavings] = useState<number>(annualSavings);
  const performanceFee = Math.round((verifiedSavings * account.performanceFeePct) / 100);
  const totalEnerOSFee = annualSub + performanceFee + flexibilityShare;
  const customerRetains = verifiedSavings - performanceFee + flexibilityShare;

  const sliderMax = Math.max(400000, annualSavings * 2);

  const businessCase: [string, string][] = [
    ['Annual energy spend', '£1,800,000'],
    ['Potential optimisation', '8%'],
    ['Potential annual saving', '£144,000'],
    ['EnerOS fee', '£25k–£40k'],
  ];

  return (
    <>
      <ScreenHeader title="Plans" subtitle="Commercials · Performance-based pricing" Icon={CreditCard} />
      <Screen>
        <AccountCard />

        <Row>
          <StatCard
            label="Current plan"
            value={currentPlan.name}
            Icon={CreditCard}
            tone="sky"
            sub={`${gbp(currentPlan.pricePerSite)}/site/month`}
          />
          <StatCard
            label="Subscription"
            value={`${gbp(monthlySub)}/mo`}
            Icon={CreditCard}
            tone="violet"
            sub={`${siteCount} sites · ${gbp(annualSub)}/yr`}
          />
          <StatCard
            label="Performance fee"
            value={`${account.performanceFeePct}%`}
            Icon={Sparkles}
            tone="amber"
            sub="only on verified savings"
          />
          <StatCard
            label="Flexibility share"
            value={`${account.flexibilitySharePct}%`}
            Icon={ShieldCheck}
            tone="emerald"
            sub="platform share of market revenue"
          />
        </Row>

        {/* Plan tiers */}
        {plans.map((plan) => {
          const isCurrent = plan.id === account.planId;
          return (
            <View
              key={plan.id}
              style={[s.planCard, plan.highlight && s.planCardHighlight]}
            >
              {plan.highlight ? (
                <View style={s.popular}>
                  <Text style={s.popularText}>Most popular</Text>
                </View>
              ) : null}

              <View style={s.planHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.planName}>{plan.name}</Text>
                  <Text style={s.planTagline}>{plan.tagline}</Text>
                </View>
                {isCurrent ? <Badge tone="emerald">Current</Badge> : null}
              </View>

              <View style={s.priceRow}>
                <Text style={s.price}>{gbp(plan.pricePerSite)}</Text>
                <Text style={s.priceUnit}>/site/month</Text>
              </View>

              <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                {plan.features.map((feature) => (
                  <View key={feature} style={s.feature}>
                    <Check size={15} color={colors.emerald600} strokeWidth={2.6} />
                    <Text style={s.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              <Button
                label={isCurrent ? 'Your current plan' : `Move to ${plan.name}`}
                onPress={() =>
                  pushToast(
                    `Plan change requested: ${plan.name} · ${gbp(plan.pricePerSite)}/site/month`,
                  )
                }
                variant={isCurrent ? 'secondary' : 'primary'}
                disabled={isCurrent}
                full
              />
            </View>
          );
        })}

        {/* Performance fee calculator + annual value summary */}
        <View style={s.twoCol}>
          <Card>
            <SectionHeading
              title="Performance fee calculator"
              subtitle="You only pay on savings that are measured and verified."
              action={<Calculator size={16} color={colors.slate400} strokeWidth={2} />}
            />
            <Text style={s.fieldLabel}>Verified annual savings</Text>
            <View style={s.moneyRow}>
              <Text style={s.currency}>£</Text>
              <TextInput
                value={String(verifiedSavings)}
                onChangeText={(v) => setVerifiedSavings(Number(v.replace(/[^0-9]/g, '')) || 0)}
                keyboardType="numeric"
                selectTextOnFocus
                style={s.moneyInput}
              />
            </View>

            <Slider
              style={s.slider}
              minimumValue={0}
              maximumValue={sliderMax}
              step={1000}
              value={verifiedSavings}
              onValueChange={(v) => setVerifiedSavings(Math.round(v))}
              minimumTrackTintColor={colors.emerald600}
              maximumTrackTintColor={colors.slate200}
              thumbTintColor={colors.emerald600}
            />
            <View style={s.sliderLabels}>
              <Text style={s.sliderLabel}>£0</Text>
              <Text style={s.sliderLabel}>£{Math.round(sliderMax / 1000)}k</Text>
            </View>

            <View style={s.resultRow}>
              <View style={[s.resultBox, s.resultBoxNegative]}>
                <Text style={s.resultLabelNegative}>
                  EnerOS fee ({account.performanceFeePct}%)
                </Text>
                <Text style={s.resultValueNegative}>{gbp(performanceFee)}</Text>
              </View>
              <View style={[s.resultBox, s.resultBoxPositive]}>
                <Text style={s.resultLabelPositive}>You retain</Text>
                <Text style={s.resultValuePositive}>
                  {gbp(verifiedSavings - performanceFee)}
                </Text>
              </View>
            </View>

            <Text style={s.note}>
              That is {((1 - account.performanceFeePct / 100) * 100).toFixed(0)}% of verified
              savings kept by the customer — EnerOS earns more only when the customer saves more.
            </Text>
          </Card>

          <Card>
            <SectionHeading
              title="Annual value summary"
              subtitle={`${account.name} · ${siteCount} sites on the ${currentPlan.name} plan.`}
            />
            <View style={{ gap: spacing.sm }}>
              <ValueRow label={`Subscription (${siteCount} × ${gbp(currentPlan.pricePerSite)} × 12)`} value={gbp(annualSub)} />
              <ValueRow label={`Performance fee (${account.performanceFeePct}%)`} value={gbp(performanceFee)} />
              <ValueRow label={`Flexibility revenue (${account.flexibilitySharePct}% share)`} value={gbp(flexibilityShare)} />
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total EnerOS cost / year</Text>
                <Text style={s.totalValue}>{gbp(totalEnerOSFee)}</Text>
              </View>
            </View>

            <View style={s.outcome}>
              <Text style={s.outcomeKicker}>Customer outcome</Text>
              <Text style={s.outcomeBody}>
                Verified savings of {gbp(verifiedSavings)} plus flexibility revenue of{' '}
                {gbp(flexibilityShare)}, net of fees.
              </Text>
              <Text style={s.outcomeValue}>{gbp(customerRetains)}</Text>
              <Text style={s.outcomeCaption}>net annual benefit retained by the customer</Text>
            </View>
          </Card>
        </View>

        {/* Illustrative business case */}
        <Card style={s.caseCard}>
          <SectionHeading
            title="Illustrative business case"
            subtitle="This is the shape of deal EnerOS is selling — a quantified outcome, not “AI software”."
            action={<Badge tone="emerald">35-site restaurant group</Badge>}
          />
          <View style={s.caseGrid}>
            {businessCase.map(([label, value]) => (
              <View key={label} style={s.caseTile}>
                <Text style={s.caseLabel}>{label}</Text>
                <Text style={s.caseValue}>{value}</Text>
              </View>
            ))}
          </View>
          <Text style={s.caseBody}>
            The customer retains most of the economic benefit — which is why the proposition is
            easy to sell. Give EnerOS your energy data, and it identifies what you are wasting,
            shows the financial impact, and automatically fixes the problems you approve.
          </Text>
        </Card>
      </Screen>
    </>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.valueRow}>
      <Text style={s.valueLabel}>{label}</Text>
      <Text style={s.valueAmount}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  twoCol: { gap: spacing.lg },

  /* Plan cards */
  planCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: spacing.lg,
  },
  planCardHighlight: { borderWidth: 2, borderColor: colors.emerald500, marginTop: spacing.md },
  popular: {
    position: 'absolute',
    top: -12,
    left: spacing.lg,
    backgroundColor: colors.emerald600,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    zIndex: 1,
  },
  popularText: { color: colors.white, fontSize: font.xs, fontWeight: fontWeight.semibold },
  planHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  planName: { fontSize: font.lg, fontWeight: fontWeight.bold, color: colors.slate800 },
  planTagline: { fontSize: font.md, color: colors.slate500, marginTop: 2 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  price: {
    fontSize: font['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.slate800,
    letterSpacing: -0.5,
  },
  priceUnit: { fontSize: font.md, color: colors.slate500 },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  featureText: { flex: 1, fontSize: font.md, color: colors.slate600, lineHeight: font.base + 5 },

  /* Calculator */
  fieldLabel: {
    fontSize: font.xs + 1,
    fontWeight: fontWeight.semibold,
    color: colors.slate500,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  currency: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate400 },
  moneyInput: {
    flex: 1,
    fontSize: font.md,
    fontWeight: fontWeight.semibold,
    color: colors.slate800,
    padding: 0,
  },
  slider: { width: '100%', height: 34, marginTop: spacing.sm },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderLabel: { fontSize: font.xs, color: colors.slate400 },

  resultRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  resultBox: { flex: 1, borderRadius: radius.md, padding: spacing.md },
  resultBoxNegative: { backgroundColor: colors.rose50 },
  resultBoxPositive: { backgroundColor: colors.emerald50 },
  resultLabelNegative: { fontSize: font.xs, fontWeight: fontWeight.medium, color: colors.rose600 },
  resultLabelPositive: { fontSize: font.xs, fontWeight: fontWeight.medium, color: colors.emerald600 },
  resultValueNegative: {
    fontSize: font.xl,
    fontWeight: fontWeight.bold,
    color: colors.rose700,
    marginTop: 4,
  },
  resultValuePositive: {
    fontSize: font.xl,
    fontWeight: fontWeight.bold,
    color: colors.emerald700,
    marginTop: 4,
  },
  note: {
    fontSize: font.xs,
    color: colors.slate400,
    lineHeight: font.md + 6,
    marginTop: spacing.md,
  },

  /* Value summary */
  valueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  valueLabel: { flex: 1, fontSize: font.md, color: colors.slate500, lineHeight: font.base + 5 },
  valueAmount: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate800 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  totalLabel: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate700 },
  totalValue: { fontSize: font.lg, fontWeight: fontWeight.bold, color: colors.slate800 },

  outcome: {
    backgroundColor: colors.ink900,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: 4,
  },
  outcomeKicker: {
    fontSize: font.xs,
    fontWeight: fontWeight.semibold,
    color: colors.emerald400,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  outcomeBody: { fontSize: font.sm, color: colors.slate300, lineHeight: font.base + 5 },
  outcomeValue: {
    fontSize: font['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.white,
    marginTop: 6,
  },
  outcomeCaption: { fontSize: font.xs, color: colors.slate400 },

  /* Business case */
  caseCard: { backgroundColor: colors.emerald50 },
  caseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  caseTile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.emerald100,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  caseLabel: { fontSize: font.xs, fontWeight: fontWeight.medium, color: colors.slate500 },
  caseValue: { fontSize: font.lg, fontWeight: fontWeight.bold, color: colors.slate800, marginTop: 4 },
  caseBody: {
    fontSize: font.md,
    color: colors.slate600,
    lineHeight: font.base + 6,
    marginTop: spacing.md,
  },
});


