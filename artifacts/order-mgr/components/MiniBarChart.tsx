import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export interface BarData {
  label: string;
  primary: number;   // revenue / income
  secondary?: number; // expenses
}

interface MiniBarChartProps {
  data: BarData[];
  height?: number;
  primaryColor: string;
  secondaryColor?: string;
  formatValue?: (v: number) => string;
  showLegend?: boolean;
}

function fmtAmount(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
}

export function MiniBarChart({
  data,
  height = 140,
  primaryColor,
  secondaryColor,
  formatValue = fmtAmount,
  showLegend = true,
}: MiniBarChartProps) {
  const colors = useColors();

  if (!data.length) return null;

  const maxVal = Math.max(
    ...data.map(d => Math.max(d.primary, d.secondary ?? 0)),
    1
  );
  const expColor = secondaryColor ?? '#E07070';
  const hasSecondary = data.some(d => (d.secondary ?? 0) > 0);

  return (
    <View>
      {showLegend && hasSecondary && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: primaryColor }]} />
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Revenue</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: expColor }]} />
            <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>Expenses</Text>
          </View>
        </View>
      )}
      <View style={[styles.chart, { height }]}>
        {data.map((d, i) => {
          const primPct = (d.primary / maxVal) * 100;
          const secPct = ((d.secondary ?? 0) / maxVal) * 100;
          const topVal = Math.max(d.primary, d.secondary ?? 0);
          return (
            <View key={`${d.label}-${i}`} style={styles.barGroup}>
              <Text style={[styles.topValue, { color: colors.mutedForeground }]}>
                {topVal > 0 ? formatValue(topVal) : ''}
              </Text>
              <View style={styles.barsRow}>
                {/* Primary bar */}
                <View
                  style={[
                    styles.barTrack,
                    {
                      backgroundColor: colors.muted,
                      flex: hasSecondary ? undefined : 1,
                      width: hasSecondary ? 12 : undefined,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${Math.max(primPct, primPct > 0 ? 4 : 0)}%`,
                        backgroundColor: primaryColor,
                      },
                    ]}
                  />
                </View>
                {/* Secondary bar (expenses) */}
                {hasSecondary && (
                  <View style={[styles.barTrack, { backgroundColor: colors.muted, width: 12 }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(secPct, secPct > 0 ? 4 : 0)}%`,
                          backgroundColor: expColor,
                        },
                      ]}
                    />
                  </View>
                )}
              </View>
              <Text style={[styles.barLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barGroup: { flex: 1, alignItems: 'center', gap: 3 },
  topValue: { fontSize: 8, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  barsRow: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'flex-end',
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  barTrack: { borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden', height: '100%' },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
