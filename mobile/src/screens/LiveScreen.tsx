import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Activity, Clock, Leaf, RefreshCw, TrendingDown, Zap } from 'lucide-react-native';

import { useApp } from '../store';
import { api, ApiError, type LiveCarbonResponse, type LiveTariffResponse } from '../lib/api';
import { Badge, Button, Card, SectionHeading, StatCard } from '../components/ui';
import { Screen, ScreenHeader, Row } from '../components/Layout';
import { PriceCurve } from '../components/charts';
import { gbp2, pence } from '../lib/format';
import { colors, font, fontWeight, radius, spacing } from '../theme';

/**
 * Format an instant in UK local time. `Intl` timezone support is not guaranteed
 * on Hermes, so this falls back to UTC rather than throwing and blanking the
 * screen.
 */
function timeLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    const d = new Date(iso);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
}

function windowLabel(from?: string | null, to?: string | null): string {
  return from && to ? `${timeLabel(from)}–${timeLabel(to)}` : '—';
}

const carbonTone: Record<string, 'emerald' | 'sky' | 'amber' | 'rose' | 'slate'> = {
  'very low': 'emerald',
  low: 'emerald',
  moderate: 'amber',
  high: 'rose',
  'very high': 'rose',
};

export default function LiveScreen() {
  const { sites } = useApp();
  const [hours, setHours] = useState(3);
  const [kwh, setKwh] = useState(120);
  const [data, setData] = useState<LiveTariffResponse | null>(null);
  const [carbon, setCarbon] = useState<LiveCarbonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const postcode = useMemo(() => sites.find((s) => s.postcode)?.postcode, [sites]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tariff, carbonData] = await Promise.all([
        api.getLiveTariff({ postcode, hours, kwh }),
        api.getLiveCarbon().catch(() => null),
      ]);
      setData(tariff);
      if (carbonData) setCarbon(carbonData);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the live feed.');
    } finally {
      setLoading(false);
    }
  }, [postcode, hours, kwh]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      api.getLiveCarbon().then(setCarbon).catch(() => undefined);
    }, 300_000);
    return () => clearInterval(id);
  }, []);

  const rates = data?.tariff.rates ?? [];
  const points = useMemo(
    () => rates.map((r) => ({ label: timeLabel(r.validFrom), price: r.unitRateP })),
    [rates],
  );
  const indexByFrom = useMemo(() => new Map(rates.map((r, i) => [r.validFrom, i])), [rates]);
  const indexByTo = useMemo(() => new Map(rates.map((r, i) => [r.validTo, i])), [rates]);

  const cheapest = data?.tariff.cheapest[0] ?? null;
  const priciest = data?.tariff.priciest[0] ?? null;
  const cheapRange: [number, number] | null =
    cheapest && indexByFrom.has(cheapest.from) && indexByTo.has(cheapest.to)
      ? [indexByFrom.get(cheapest.from) as number, indexByTo.get(cheapest.to) as number]
      : null;
  const peakRange: [number, number] | null =
    priciest && indexByFrom.has(priciest.from) && indexByTo.has(priciest.to)
      ? [indexByFrom.get(priciest.from) as number, indexByTo.get(priciest.to) as number]
      : null;

  const shift = data?.shift ?? null;
  const current = data?.tariff.current ?? null;
  const carbonNow = carbon?.current ?? null;

  return (
    <>
      <ScreenHeader
        title="Live Market"
        subtitle={
          data ? `${data.tariff.regionName} · real half-hourly UK prices` : 'Connecting to the live market…'
        }
        Icon={Activity}
      />
      <Screen>
        <Row>
          <StatCard
            label="Price now"
            value={current ? pence(current.unitRateP, 2) : '—'}
            sub="Agile reference"
            Icon={Zap}
            tone="emerald"
          />
          <StatCard
            label={`Cheapest ${hours}h`}
            value={cheapest ? pence(cheapest.avgUnitRateP, 2) : '—'}
            sub={cheapest ? windowLabel(cheapest.from, cheapest.to) : '—'}
            Icon={TrendingDown}
            tone="sky"
            subTone="positive"
          />
        </Row>
        <Row>
          <StatCard
            label={`Peak ${hours}h`}
            value={priciest ? pence(priciest.avgUnitRateP, 2) : '—'}
            sub={priciest ? windowLabel(priciest.from, priciest.to) : '—'}
            Icon={Activity}
            tone="rose"
            subTone="negative"
          />
          <StatCard
            label="Grid carbon"
            value={carbonNow ? `${carbonNow.actual ?? carbonNow.forecast} g` : '—'}
            sub={carbonNow ? `${carbonNow.index} gCO2/kWh` : '—'}
            Icon={Leaf}
            tone="violet"
          />
        </Row>

        {error ? (
          <Card style={s.errorCard}>
            <Text style={s.errorText}>{error}</Text>
          </Card>
        ) : null}

        <Card>
          <SectionHeading
            title="Half-hourly price curve"
            subtitle="Green = cheapest window · red = peak"
            action={
              loading ? (
                <ActivityIndicator color={colors.emerald600} />
              ) : (
                <Badge tone={data?.tariff.cached ? 'slate' : 'emerald'}>
                  {data?.tariff.cached ? 'cached' : 'live'}
                </Badge>
              )
            }
          />
          {points.length > 0 ? (
            <PriceCurve points={points} cheapRange={cheapRange} peakRange={peakRange} />
          ) : (
            <Text style={s.empty}>Loading live prices…</Text>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Live shift calculator"
            subtitle="Priced on today's real curve"
            action={<Badge tone="violet">Module E</Badge>}
          />
          <View style={s.sliderBlock}>
            <View style={s.sliderHead}>
              <Text style={s.sliderLabel}>Shiftable energy</Text>
              <Text style={s.sliderValue}>{kwh} kWh</Text>
            </View>
            <Slider
              minimumValue={10}
              maximumValue={2000}
              step={10}
              value={kwh}
              onValueChange={setKwh}
              minimumTrackTintColor={colors.emerald600}
              maximumTrackTintColor={colors.slate200}
              thumbTintColor={colors.emerald600}
            />
          </View>
          <View style={s.sliderBlock}>
            <View style={s.sliderHead}>
              <Text style={s.sliderLabel}>Run duration</Text>
              <Text style={s.sliderValue}>{hours} h</Text>
            </View>
            <Slider
              minimumValue={1}
              maximumValue={8}
              step={0.5}
              value={hours}
              onValueChange={setHours}
              minimumTrackTintColor={colors.emerald600}
              maximumTrackTintColor={colors.slate200}
              thumbTintColor={colors.emerald600}
            />
          </View>
          <View style={s.savingBox}>
            <Text style={s.savingLabel}>Estimated saving</Text>
            <Text style={s.savingValue}>
              {shift ? gbp2(shift.savingGbpPerMonth) : '—'}
              <Text style={s.savingUnit}> / month</Text>
            </Text>
            <Text style={s.savingMeta}>
              {shift
                ? `${gbp2(shift.savingGbpPerCycle)} per cycle · ${pence(shift.gapP, 2)}/kWh gap`
                : 'Awaiting live prices.'}
            </Text>
            <View style={s.shiftRow}>
              <Text style={s.shiftKey}>From (peak)</Text>
              <Text style={s.shiftVal} numberOfLines={1}>
                {shift?.from
                  ? `${windowLabel(shift.from.from, shift.from.to)} · ${pence(shift.from.avgUnitRateP, 2)}`
                  : '—'}
              </Text>
            </View>
            <View style={s.shiftRow}>
              <Text style={s.shiftKey}>To (cheapest)</Text>
              <Text style={s.shiftVal} numberOfLines={1}>
                {shift?.to
                  ? `${windowLabel(shift.to.from, shift.to.to)} · ${pence(shift.to.avgUnitRateP, 2)}`
                  : '—'}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <SectionHeading
            title="Grid carbon intensity"
            subtitle="A second signal for net-zero targets"
            action={
              carbonNow ? (
                <Badge tone={carbonTone[carbonNow.index] ?? 'slate'}>{carbonNow.index}</Badge>
              ) : null
            }
          />
          {carbon && carbon.forecast.length > 0 ? (
            <View style={s.carbonRow}>
              {carbon.forecast.slice(0, 6).map((p) => (
                <View key={p.from} style={s.carbonChip}>
                  <Text style={s.carbonTime}>{timeLabel(p.from)}</Text>
                  <Text style={s.carbonVal}>{p.forecast ?? p.actual ?? '—'}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.empty}>Carbon feed unavailable.</Text>
          )}
        </Card>

        <View style={s.actionsRow}>
          <Button label="Refresh" onPress={load} variant="secondary" Icon={RefreshCw} />
        </View>
        <Text style={s.footer}>
          Live sources: {data?.tariff.source ?? 'Octopus Energy'} ·{' '}
          {carbon?.source ?? 'NESO Carbon Intensity'}. Half-hourly rates are a published market
          reference, not the customer's own contract.
        </Text>
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  errorCard: { backgroundColor: colors.amber50, borderColor: colors.amber500, borderWidth: 1 },
  errorText: { color: colors.amber700, fontSize: font.sm },
  empty: { color: colors.slate400, fontSize: font.sm, textAlign: 'center', paddingVertical: spacing.xl },
  sliderBlock: { marginBottom: spacing.lg },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  sliderLabel: { fontSize: font.sm, color: colors.slate500 },
  sliderValue: { fontSize: font.sm, fontWeight: fontWeight.bold, color: colors.slate800 },
  savingBox: {
    backgroundColor: colors.slate50,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
  },
  savingLabel: {
    fontSize: font.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.slate400,
  },
  savingValue: { fontSize: font['2xl'], fontWeight: fontWeight.bold, color: colors.emerald700 },
  savingUnit: { fontSize: font.sm, fontWeight: fontWeight.medium, color: colors.slate400 },
  savingMeta: { fontSize: font.xs, color: colors.slate500, marginBottom: spacing.sm },
  shiftRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: 4 },
  shiftKey: { fontSize: font.xs, color: colors.slate500 },
  shiftVal: {
    flex: 1,
    textAlign: 'right',
    fontSize: font.xs,
    fontWeight: fontWeight.semibold,
    color: colors.slate800,
  },
  carbonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  carbonChip: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 62,
  },
  carbonTime: { fontSize: font.xs, color: colors.slate400 },
  carbonVal: { fontSize: font.base, fontWeight: fontWeight.bold, color: colors.slate800 },
  actionsRow: { flexDirection: 'row' },
  footer: { fontSize: font.xs, color: colors.slate400, lineHeight: 16 },
});
