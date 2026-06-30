import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KPICard } from '@/components/KPICard';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order } from '@/types';

type Period = 'Weekly' | 'Monthly';

function getRevenueByPeriod(orders: Order[], period: Period) {
  const now = new Date();
  const cutoff = new Date();
  if (period === 'Weekly') cutoff.setDate(now.getDate() - 7);
  else cutoff.setMonth(now.getMonth() - 1);
  return orders
    .filter(o => new Date(o.createdAt) >= cutoff)
    .reduce((s, o) => s + o.amountPaid, 0);
}

function getSourceCounts(orders: Order[]) {
  const counts: Record<string, number> = {};
  for (const o of orders) counts[o.source] = (counts[o.source] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function getTopProducts(orders: Order[]) {
  const counts: Record<string, number> = {};
  for (const o of orders) {
    const name = o.customName || 'Custom';
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function getMonthlyRevenue(orders: Order[]) {
  const months: Record<string, number> = {};
  for (const o of orders) {
    const key = o.createdAt?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    months[key] = (months[key] || 0) + o.amountPaid;
  }
  return Object.entries(months).sort().slice(-6);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { orders } = useDatabase();
  const [period, setPeriod] = useState<Period>('Monthly');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const stats = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter(o => o.status === 'Delivered').length;
    const revenue = orders.reduce((s, o) => s + o.amountPaid, 0);
    const outstanding = orders.reduce((s, o) => s + Math.max(0, o.price - o.amountPaid), 0);
    const overdue = orders.filter(o => o.dueDate && o.status !== 'Delivered' && o.dueDate < new Date().toISOString().split('T')[0]).length;
    const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    const periodRevenue = getRevenueByPeriod(orders, period);
    return { total, delivered, revenue, outstanding, overdue, successRate, periodRevenue };
  }, [orders, period]);

  const sourceCounts = useMemo(() => getSourceCounts(orders), [orders]);
  const topProducts = useMemo(() => getTopProducts(orders), [orders]);
  const monthlyRevenue = useMemo(() => getMonthlyRevenue(orders), [orders]);
  const maxRevenue = useMemo(() => Math.max(...monthlyRevenue.map(m => m[1]), 1), [monthlyRevenue]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Insights</Text>
        <View style={[styles.toggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['Weekly', 'Monthly'] as Period[]).map(p => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={[styles.toggleBtn, period === p && { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.toggleText, { color: period === p ? colors.primaryForeground : colors.mutedForeground }]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiRow}>
          <KPICard label="Total Orders" value={String(stats.total)} icon="package" />
          <KPICard label="Delivered" value={String(stats.delivered)} icon="check-circle" accent={colors.deliveredText} />
        </View>
        <View style={styles.kpiRow}>
          <KPICard label="Revenue" value={`₹${stats.revenue.toFixed(0)}`} icon="trending-up" accent="#C06070" />
          <KPICard label="Outstanding" value={`₹${stats.outstanding.toFixed(0)}`} icon="alert-circle" accent={stats.outstanding > 0 ? colors.overdueText : colors.mutedForeground} />
        </View>
        <View style={styles.kpiRow}>
          <KPICard label="Success Rate" value={`${stats.successRate}%`} icon="trending-up" accent={colors.deliveredText} />
          <KPICard label="Overdue" value={String(stats.overdue)} icon="clock" accent={stats.overdue > 0 ? colors.overdueText : colors.mutedForeground} />
        </View>
      </View>

      {/* Revenue Chart */}
      {monthlyRevenue.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Monthly Revenue</Text>
          <View style={styles.chart}>
            {monthlyRevenue.map(([month, rev]) => {
              const pct = (rev / maxRevenue) * 100;
              const m = parseInt(month.split('-')[1]) - 1;
              return (
                <View key={month} style={styles.barCol}>
                  <Text style={[styles.barValue, { color: colors.mutedForeground }]}>₹{rev > 999 ? `${(rev / 1000).toFixed(1)}k` : rev.toFixed(0)}</Text>
                  <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.barFill, { height: `${Math.max(pct, 4)}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{MONTH_NAMES[m]}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Source Breakdown */}
      {sourceCounts.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Orders by Source</Text>
          {sourceCounts.map(([source, count]) => {
            const pct = orders.length > 0 ? (count / orders.length) * 100 : 0;
            return (
              <View key={source} style={styles.sourceRow}>
                <Text style={[styles.sourceLabel, { color: colors.foreground }]}>{source}</Text>
                <View style={[styles.sourceTrack, { backgroundColor: colors.muted }]}>
                  <View style={[styles.sourceFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                </View>
                <Text style={[styles.sourceCount, { color: colors.mutedForeground }]}>{count}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Top Products */}
      {topProducts.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top Products</Text>
          {topProducts.map(([name, count], i) => (
            <View key={name} style={styles.productRow}>
              <View style={[styles.rank, { backgroundColor: i === 0 ? colors.primary : colors.muted }]}>
                <Text style={[styles.rankText, { color: i === 0 ? colors.primaryForeground : colors.mutedForeground }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
              <Text style={[styles.productCount, { color: colors.mutedForeground }]}>{count} orders</Text>
            </View>
          ))}
        </View>
      )}

      {orders.length === 0 && (
        <View style={styles.empty}>
          <Feather name="bar-chart-2" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No data yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Create orders to see analytics</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  toggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, overflow: 'hidden', padding: 2 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  toggleText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  kpiGrid: { paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  section: { marginHorizontal: 16, marginBottom: 14, borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  barTrack: { flex: 1, width: '100%', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', width: 80 },
  sourceTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  sourceFill: { height: '100%', borderRadius: 4 },
  sourceCount: { fontSize: 13, fontFamily: 'Inter_500Medium', width: 28, textAlign: 'right' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  productName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  productCount: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  empty: { alignItems: 'center', paddingTop: 64, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
