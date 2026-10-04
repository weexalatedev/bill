import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Building2, Gauge, MapPin, PlugZap, Search } from 'lucide-react-native';

import { useApp } from '../store';
import type { SiteStatus } from '../types';
import { Badge, Card, Chips, SectionHeading, StatCard } from '../components/ui';
import { Screen, ScreenHeader, Row } from '../components/Layout';
import { gbp, signedGbp } from '../lib/format';
import { colors, font, fontWeight, radius, spacing } from '../theme';

const statusTone: Record<SiteStatus, 'emerald' | 'amber' | 'rose'> = {
  Optimal: 'emerald',
  Watch: 'amber',
  Anomaly: 'rose',
};

export default function SitesScreen() {
  const { sites, annualSpendTotal, metrics } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'All' | SiteStatus>('All');
  const [type, setType] = useState<string>('All');

  const types = useMemo(() => ['All', ...Array.from(new Set(sites.map((s) => s.type)))], [sites]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((site) => {
      const matchesStatus = status === 'All' || site.status === status;
      const matchesType = type === 'All' || site.type === type;
      const matchesQuery =
        q.length === 0 || `${site.name} ${site.city} ${site.region}`.toLowerCase().includes(q);
      return matchesStatus && matchesType && matchesQuery;
    });
  }, [sites, query, status, type]);

  const controllableLoads = sites.reduce((total, site) => total + site.loads.length, 0);
  const attention = sites.filter((s) => s.status !== 'Optimal').length;

  return (
    <>
      <ScreenHeader title="Sites" subtitle="Module A · Energy Data OS" Icon={Building2} />
      <Screen>
        <Row>
          <StatCard
            label="Sites connected"
            value={String(sites.length)}
            Icon={Building2}
            tone="sky"
            sub="in the Energy Data OS"
          />
          <StatCard
            label="Annual spend"
            value={gbp(annualSpendTotal)}
            Icon={Gauge}
            tone="slate"
            sub="across the portfolio"
          />
          <StatCard
            label="Controllable loads"
            value={String(controllableLoads)}
            Icon={PlugZap}
            tone="violet"
            sub="ready for optimisation"
          />
          <StatCard
            label="Needs attention"
            value={String(attention)}
            Icon={AlertTriangle}
            tone="rose"
            sub="watch or anomaly status"
            subTone="negative"
          />
        </Row>

        <Card>
          <SectionHeading
            title="Portfolio"
            subtitle="Every site gets a continuously updated digital energy model."
            action={
              <Badge tone="emerald">Saved {signedGbp(metrics.savings)}</Badge>
            }
          />

          <View style={s.searchBox}>
            <Search size={15} color={colors.slate400} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search sites…"
              placeholderTextColor={colors.slate400}
              style={s.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Chips
              options={['All', 'Optimal', 'Watch', 'Anomaly'] as const}
              value={status}
              onChange={setStatus}
            />
            <Chips options={types} value={type} onChange={setType} />
          </View>

          <View style={{ gap: spacing.md }}>
            {visible.map((site) => {
              const saving = site.monthExpected - site.monthActual;
              return (
                <View key={site.id} style={s.siteCard}>
                  <View style={s.siteHead}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>
                        {site.name}
                      </Text>
                      <View style={s.locationRow}>
                        <MapPin size={12} color={colors.slate400} strokeWidth={2} />
                        <Text style={s.location} numberOfLines={1}>
                          {site.city}, {site.region}
                        </Text>
                      </View>
                    </View>
                    <Badge tone={statusTone[site.status]}>{site.status}</Badge>
                  </View>

                  <Text style={s.siteType}>{site.type}</Text>

                  <View style={s.metrics}>
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>This month</Text>
                      <Text style={s.metricValue}>{gbp(site.monthActual)}</Text>
                    </View>
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>Saved</Text>
                      <Text style={[s.metricValue, { color: colors.emerald600 }]}>
                        {signedGbp(saving)}
                      </Text>
                    </View>
                    <View style={s.metric}>
                      <Text style={s.metricLabel}>Annual</Text>
                      <Text style={s.metricValue}>{gbp(site.annualSpend)}</Text>
                    </View>
                  </View>

                  <View style={s.loadRow}>
                    {site.loads.map((load) => (
                      <View key={load} style={s.loadChip}>
                        <Text style={s.loadChipText}>{load}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={s.siteFoot}>
                    <View style={s.footItem}>
                      <PlugZap size={12} color={colors.slate400} strokeWidth={2} />
                      <Text style={s.footText}>{site.meterType} meter</Text>
                    </View>
                    <Text style={s.footText}>Synced {site.lastSynced}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {visible.length === 0 ? (
            <Text style={s.noResults}>No sites match your filters.</Text>
          ) : null}
        </Card>
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
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

  siteCard: {
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  siteHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { fontSize: font.md, fontWeight: fontWeight.semibold, color: colors.slate800 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  location: { fontSize: font.xs + 1, color: colors.slate500 },
  siteType: {
    fontSize: font.xs + 1,
    color: colors.slate400,
    fontWeight: fontWeight.medium,
  },

  metrics: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.slate50,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: 2,
  },
  metric: { flex: 1, alignItems: 'center' },
  metricLabel: {
    fontSize: 10,
    color: colors.slate400,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: { fontSize: font.sm, fontWeight: fontWeight.bold, color: colors.slate800, marginTop: 3 },

  loadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  loadChip: {
    backgroundColor: colors.emerald50,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  loadChipText: { fontSize: 10.5, fontWeight: fontWeight.medium, color: colors.emerald700 },

  siteFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footText: { fontSize: font.xs + 1, color: colors.slate400 },

  noResults: {
    textAlign: 'center',
    fontSize: font.sm,
    color: colors.slate500,
    paddingVertical: spacing.lg,
  },
});


