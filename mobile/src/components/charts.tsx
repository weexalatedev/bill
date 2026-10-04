import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import type { AssetSlice, MonthlyPoint } from '../types';
import { colors, font, fontWeight, radius, spacing } from '../theme';
import { compactGbp, gbp, kwh, pct, share } from '../lib/format';

/* ------------------------------------------------------------ Spend area chart */

export function SpendChart({ data, height = 210 }: { data: MonthlyPoint[]; height?: number }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const padLeft = 46;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 24;

  const plotW = Math.max(0, width - padLeft - padRight);
  const plotH = Math.max(0, height - padTop - padBottom);

  const all = data.flatMap((d) => [d.actual, d.expected]);
  const max = Math.max(1, ...all) * 1.1;
  const min = 0;

  const xAt = (i: number) =>
    data.length > 1 ? padLeft + (i / (data.length - 1)) * plotW : padLeft + plotW / 2;
  const yAt = (v: number) => padTop + plotH - ((v - min) / (max - min)) * plotH;

  const lineFor = (key: 'actual' | 'expected') =>
    data
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`)
      .join(' ');

  const last = data.length - 1;
  const areaPath =
    data.length > 1
      ? `${lineFor('actual')} L${xAt(last).toFixed(1)},${(padTop + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
      : '';

  const gridCount = 4;
  const grid = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = min + ((max - min) / gridCount) * i;
    return { v, y: yAt(v) };
  });

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.emerald500} stopOpacity="0.28" />
              <Stop offset="1" stopColor={colors.emerald500} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {grid.map((g) => (
            <Line
              key={`g${g.v}`}
              x1={padLeft}
              x2={padLeft + plotW}
              y1={g.y}
              y2={g.y}
              stroke={colors.slate200}
              strokeWidth={1}
              strokeDasharray={g.v === grid[0].v ? undefined : '3 4'}
            />
          ))}

          {grid.map((g) => (
            <SvgText
              key={`t${g.v}`}
              x={padLeft - 8}
              y={g.y + 3.5}
              fontSize={10}
              fill={colors.slate400}
              textAnchor="end"
            >
              {compactGbp(g.v)}
            </SvgText>
          ))}

          {areaPath ? <Path d={areaPath} fill="url(#spendFill)" /> : null}
          <Path
            d={lineFor('expected')}
            stroke={colors.slate400}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            fill="none"
          />
          <Path d={lineFor('actual')} stroke={colors.emerald500} strokeWidth={2.5} fill="none" />

          {data.map((d, i) =>
            i === last ? (
              <Circle
                key={`p${d.month}`}
                cx={xAt(i)}
                cy={yAt(d.actual)}
                r={4}
                fill={colors.white}
                stroke={colors.emerald500}
                strokeWidth={2.5}
              />
            ) : null,
          )}

          {data.map((d, i) =>
            i % 3 === 0 || i === last ? (
              <SvgText
                key={`x${d.month}`}
                x={xAt(i)}
                y={height - 6}
                fontSize={10}
                fill={colors.slate400}
                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
              >
                {d.month}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <View style={s.legend}>
      {items.map((it) => (
        <View key={it.label} style={s.legendItem}>
          {it.dashed ? (
            <View style={[s.legendDashed, { borderColor: it.color }]} />
          ) : (
            <View style={[s.legendDot, { backgroundColor: it.color }]} />
          )}
          <Text style={s.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------- Horizontal bars */

export function Bars({ data, color = colors.emerald500 }: { data: AssetSlice[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.spend));
  const total = data.reduce((t, d) => t + d.kwh, 0);

  return (
    <View style={{ gap: spacing.lg }}>
      {data.map((d) => (
        <View key={d.asset}>
          <View style={s.barHead}>
            <Text style={s.barLabel} numberOfLines={1}>
              {d.asset}
            </Text>
            <Text style={s.barValue}>{gbp(d.spend)}</Text>
          </View>
          <View style={s.barTrack}>
            <View
              style={[
                s.barFill,
                { width: `${(d.spend / max) * 100}%`, backgroundColor: color },
              ]}
            />
          </View>
          <Text style={s.barMeta}>
            {kwh(d.kwh)} · {pct(share(d.kwh, total), 0)} of load
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Single stacked bar showing the mix of meters across the portfolio. */
export function StackedBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((t, sgm) => t + sgm.value, 0) || 1;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={s.stackTrack}>
        {segments.map((sgm) => (
          <View
            key={sgm.label}
            style={{
              width: `${share(sgm.value, total)}%`,
              backgroundColor: sgm.color,
              height: '100%',
            }}
          />
        ))}
      </View>
      <View style={s.stackLegend}>
        {segments.map((sgm) => (
          <View key={sgm.label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: sgm.color }]} />
            <Text style={s.legendText}>
              {sgm.label} · {sgm.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------- Styles */

const s = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendDashed: { width: 14, height: 0, borderWidth: 1.5, borderStyle: 'dashed' },
  legendText: { fontSize: font.xs + 1, color: colors.slate500 },

  barHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: 5,
  },
  barLabel: { flex: 1, fontSize: font.sm, color: colors.slate700, fontWeight: fontWeight.semibold },
  barValue: { fontSize: font.sm, color: colors.slate800, fontWeight: fontWeight.bold },
  barTrack: {
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.slate100,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 5 },
  barMeta: { fontSize: font.xs, color: colors.slate400, marginTop: 5 },

  stackTrack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.slate100,
  },
  stackLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
