import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Search as SearchIcon,
  ShieldCheck,
  Upload,
} from 'lucide-react-native';

import { useApp } from '../store';
import type { BillStatus } from '../types';
import {
  Badge,
  Button,
  Card,
  Chips,
  EmptyState,
  Field,
  SectionHeading,
  StatCard,
} from '../components/ui';
import { Screen, ScreenHeader, Row } from '../components/Layout';
import { gbp, gbp2, kwh, num, pence, signedGbp } from '../lib/format';
import { colors, font, fontWeight, radius, spacing } from '../theme';

type Filter = 'All' | BillStatus;

const statusTone: Record<BillStatus, 'emerald' | 'rose' | 'sky'> = {
  Clean: 'emerald',
  Flagged: 'rose',
  Recovered: 'sky',
};

interface FormState {
  siteId: string;
  supplier: string;
  period: string;
  consumptionKwh: string;
  unitRateP: string;
  standingChargeP: string;
}

/** label/value row used by the invoice detail breakdown. */
function DetailRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View style={[s.detailRow, strong && s.detailRowStrong]}>
      <Text style={[s.detailLabel, strong && s.detailLabelStrong]}>{label}</Text>
      <Text style={[s.detailValue, strong && s.detailValueStrong]}>{value}</Text>
    </View>
  );
}

export default function BillsScreen() {
  const { invoices, sites, suppliers, metrics, analyseUpload, recoverInvoice, getSiteById } =
    useApp();

  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(invoices[0]?.id ?? null);
  const [form, setForm] = useState<FormState>({
    siteId: sites[0]?.id ?? '',
    supplier: suppliers[0] ?? '',
    period: 'Apr 2026',
    consumptionKwh: '38000',
    unitRateP: '27.6',
    standingChargeP: '88',
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchesFilter = filter === 'All' || inv.status === filter;
      const site = getSiteById(inv.siteId);
      const matchesQuery =
        q.length === 0 ||
        inv.id.toLowerCase().includes(q) ||
        inv.supplier.toLowerCase().includes(q) ||
        (site ? `${site.name} ${site.city}`.toLowerCase().includes(q) : false);
      return matchesFilter && matchesQuery;
    });
  }, [invoices, filter, query, getSiteById]);

  const selected = invoices.find((inv) => inv.id === selectedId) ?? null;

  const recoveredValue = invoices
    .filter((inv) => inv.status === 'Recovered')
    .flatMap((inv) => inv.issues)
    .reduce((total, issue) => total + Math.abs(issue.impact), 0);

  const submit = () => {
    const consumptionKwh = Number(form.consumptionKwh);
    const unitRateP = Number(form.unitRateP);
    const standingChargeP = Number(form.standingChargeP);
    if (!form.siteId || !form.supplier) return;
    if (!Number.isFinite(consumptionKwh) || consumptionKwh <= 0) return;
    if (!Number.isFinite(unitRateP) || unitRateP <= 0) return;
    if (!Number.isFinite(standingChargeP) || standingChargeP < 0) return;

    const created = analyseUpload({
      siteId: form.siteId,
      supplier: form.supplier,
      period: form.period,
      consumptionKwh,
      unitRateP,
      standingChargeP,
    });
    setSelectedId(created.id);
    setFilter('All');
  };

  const siteLabels = Object.fromEntries(
    sites.map((site) => [site.id, `${site.name} · ${site.city}`]),
  );

  return (
    <>
      <ScreenHeader title="Bills" subtitle="Module B · Invoice audit & recovery" Icon={FileSearch} />
      <Screen>
        <Row>
          <StatCard
            label="Invoices audited"
            value={num(metrics.invoicesAudited)}
            Icon={FileSearch}
            tone="sky"
            sub="this billing cycle"
          />
          <StatCard
            label="Issues open"
            value={String(metrics.issuesOpen)}
            Icon={AlertTriangle}
            tone="rose"
            sub="awaiting challenge"
            subTone="negative"
          />
          <StatCard
            label="Value at risk"
            value={gbp(metrics.issuesValue)}
            Icon={ShieldCheck}
            tone="amber"
            sub="overcharges detected"
            subTone="negative"
          />
          <StatCard
            label="Recovered"
            value={gbp(recoveredValue)}
            Icon={CheckCircle2}
            tone="emerald"
            sub="credit notes issued"
            subTone="positive"
          />
        </Row>

        {/* Upload & audit */}
        <Card>
          <SectionHeading
            title="Upload & audit an invoice"
            subtitle="No hardware needed — the AI checks for incorrect charges, anomalies and tariff issues."
            action={<Badge tone="violet">Module B</Badge>}
          />

          <View style={{ gap: spacing.md }}>
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Site</Text>
              <Chips
                options={sites.map((site) => site.id)}
                value={form.siteId}
                onChange={(siteId) => setForm({ ...form, siteId })}
                labels={siteLabels}
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text style={s.label}>Supplier</Text>
              <Chips
                options={suppliers}
                value={form.supplier}
                onChange={(supplier) => setForm({ ...form, supplier })}
              />
            </View>

            <Field
              label="Billing period"
              value={form.period}
              onChangeText={(period) => setForm({ ...form, period })}
              placeholder="Apr 2026"
            />

            <View style={s.fieldRow}>
              <Field
                label="Consumption (kWh)"
                value={form.consumptionKwh}
                onChangeText={(consumptionKwh) => setForm({ ...form, consumptionKwh })}
                keyboardType="numeric"
              />
              <Field
                label="Unit rate (p/kWh)"
                value={form.unitRateP}
                onChangeText={(unitRateP) => setForm({ ...form, unitRateP })}
                keyboardType="numeric"
              />
            </View>

            <Field
              label="Standing charge (p/day)"
              value={form.standingChargeP}
              onChangeText={(standingChargeP) => setForm({ ...form, standingChargeP })}
              keyboardType="numeric"
            />
          </View>

          <Text style={s.tip}>
            Tip: unit rates above 26p/kWh or high standing charges get flagged by the audit.
          </Text>

          <Button label="Run AI audit" onPress={submit} variant="primary" Icon={Upload} full />
        </Card>

        {/* Invoice list */}
        <Card>
          <SectionHeading
            title="Invoices"
            subtitle="Tap a row to open the AI audit detail."
            action={<Badge tone="sky">{filtered.length} shown</Badge>}
          />

          <View style={s.filterRow}>
            <Chips
              options={['All', 'Flagged', 'Clean', 'Recovered'] as Filter[]}
              value={filter}
              onChange={setFilter}
            />
          </View>

          <View style={s.searchBox}>
            <SearchIcon size={15} color={colors.slate400} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search invoices…"
              placeholderTextColor={colors.slate400}
              style={s.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            {filtered.map((inv) => {
              const site = getSiteById(inv.siteId);
              const active = inv.id === selectedId;
              return (
                <Pressable
                  key={inv.id}
                  onPress={() => setSelectedId(inv.id)}
                  style={[s.invRow, active && s.invRowActive]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.invId}>{inv.id}</Text>
                    <Text style={s.invMeta} numberOfLines={1}>
                      {site?.name ?? inv.siteId} · {inv.supplier} · {inv.period}
                    </Text>
                    <Text style={s.invMeta}>
                      {kwh(inv.consumptionKwh)} · {pence(inv.unitRateP)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Text style={s.invTotal}>{gbp2(inv.total)}</Text>
                    <Badge tone={statusTone[inv.status]}>{inv.status}</Badge>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {filtered.length === 0 ? (
            <EmptyState
              Icon={SearchIcon}
              title="No invoices match"
              body="Try a different filter or search term."
            />
          ) : null}
        </Card>

        {/* Invoice detail */}
        {selected ? (
          <Card>
            <View style={s.detailHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.detailKicker}>Invoice detail</Text>
                <Text style={s.detailId}>{selected.id}</Text>
                <Text style={s.detailMeta}>
                  {getSiteById(selected.siteId)?.name} · {selected.period}
                </Text>
              </View>
              <Badge tone={statusTone[selected.status]}>{selected.status}</Badge>
            </View>

            <View style={s.detailBox}>
              <DetailRow label="Supplier" value={selected.supplier} />
              <DetailRow label="Consumption" value={kwh(selected.consumptionKwh)} />
              <DetailRow
                label="Energy charge"
                value={gbp2((selected.consumptionKwh * selected.unitRateP) / 100)}
              />
              <DetailRow
                label="Standing charge"
                value={gbp2((selected.standingChargeP * 31) / 100)}
              />
              <DetailRow label="Invoice total (ex. VAT)" value={gbp2(selected.total)} strong />
            </View>

            <View style={{ gap: spacing.sm }}>
              <View style={s.auditHead}>
                <ShieldCheck size={16} color={colors.emerald600} strokeWidth={2.2} />
                <Text style={s.auditTitle}>AI audit findings</Text>
              </View>

              {selected.issues.length === 0 ? (
                <View style={s.cleanRow}>
                  <CheckCircle2 size={16} color={colors.emerald600} strokeWidth={2.2} />
                  <Text style={s.cleanText}>
                    No issues detected — this invoice looks correct.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {selected.issues.map((issue) => (
                    <View key={issue.type} style={s.issue}>
                      <View style={s.issueHead}>
                        <Text style={s.issueTitle}>{issue.type}</Text>
                        {issue.impact < 0 ? (
                          <Text style={s.issueImpact}>{signedGbp(issue.impact)}</Text>
                        ) : null}
                      </View>
                      <Text style={s.issueDetail}>{issue.detail}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {selected.status === 'Flagged' ? (
              <Button
                label="Challenge supplier & request recovery"
                onPress={() => recoverInvoice(selected.id)}
                variant="primary"
                full
              />
            ) : selected.status === 'Recovered' ? (
              <View style={s.recoveryRow}>
                <Text style={s.recoveryText}>Recovery in progress</Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card>
            <EmptyState
              Icon={FileSearch}
              title="Select an invoice"
              body="Choose a row above to see the AI audit detail."
            />
          </Card>
        )}
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  label: {
    fontSize: font.xs,
    fontWeight: fontWeight.semibold,
    color: colors.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tip: { fontSize: font.xs + 1, color: colors.slate400, marginTop: spacing.md },
  fieldRow: { flexDirection: 'row', gap: spacing.md },

  filterRow: { marginBottom: spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: font.md, color: colors.slate700, padding: 0 },

  invRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate100,
    borderRadius: radius.lg,
    backgroundColor: colors.slate50,
    padding: spacing.md,
  },
  invRowActive: { borderColor: colors.emerald400, backgroundColor: colors.emerald50 },
  invId: { fontSize: font.md, fontWeight: fontWeight.bold, color: colors.slate800 },
  invMeta: { fontSize: font.xs + 1, color: colors.slate500, marginTop: 2 },
  invTotal: { fontSize: font.md, fontWeight: fontWeight.bold, color: colors.slate800 },

  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  detailKicker: {
    fontSize: font.xs,
    color: colors.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailId: { fontSize: font.lg, fontWeight: fontWeight.bold, color: colors.slate800, marginTop: 2 },
  detailMeta: { fontSize: font.xs + 1, color: colors.slate500, marginTop: 2 },

  detailBox: {
    backgroundColor: colors.slate50,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailRowStrong: {
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    paddingTop: spacing.sm,
    marginTop: 2,
  },
  detailLabel: { fontSize: font.sm, color: colors.slate500, flexShrink: 1 },
  detailLabelStrong: { fontWeight: fontWeight.semibold, color: colors.slate700 },
  detailValue: { fontSize: font.sm, fontWeight: fontWeight.medium, color: colors.slate800 },
  detailValueStrong: { fontWeight: fontWeight.bold, color: colors.slate800, fontSize: font.md },

  auditHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  auditTitle: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate800 },

  cleanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.emerald50,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cleanText: { flex: 1, fontSize: font.sm, color: colors.emerald700, lineHeight: font.md + 5 },

  issue: {
    borderWidth: 1,
    borderColor: colors.rose100,
    backgroundColor: 'rgba(255,241,242,0.7)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  issueHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  issueTitle: { fontSize: font.sm, fontWeight: fontWeight.semibold, color: colors.rose700 },
  issueImpact: { fontSize: font.sm, fontWeight: fontWeight.semibold, color: colors.rose700 },
  issueDetail: { fontSize: font.xs + 1, color: colors.rose600, marginTop: 4, lineHeight: font.md + 4 },

  recoveryRow: {
    backgroundColor: colors.sky50,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  recoveryText: { fontSize: font.sm, fontWeight: fontWeight.semibold, color: colors.sky700 },
});


