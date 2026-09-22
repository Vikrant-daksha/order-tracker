import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddExpenseModal } from '@/components/AddExpenseModal';
import { KPICard } from '@/components/KPICard';
import { MiniBarChart, BarData } from '@/components/MiniBarChart';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Expense, Order } from '@/types';

// ─── Period helpers ────────────────────────────────────────────────────────────

type Tab = 'Week' | 'Month' | 'AllTime';

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month]} ${year}`;
}

function weekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}`;
}

function filterOrdersByRange(orders: Order[], from: string, to: string) {
  return orders.filter(o => {
    const d = (o.createdAt || o.orderDate || '').slice(0, 10);
    return d >= from && d <= to;
  });
}

function filterExpensesByRange(expenses: Expense[], from: string, to: string) {
  return expenses.filter(e => e.date >= from && e.date <= to);
}

// ─── Aggregation ───────────────────────────────────────────────────────────────

function sumRevenue(orders: Order[]) {
  return orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
}
function sumExpenses(expenses: Expense[]) {
  return expenses.reduce((s, e) => s + (e.amount || 0), 0);
}
function sumOutstanding(orders: Order[]) {
  return orders.reduce((s, o) => s + Math.max(0, (o.price || 0) - (o.amountPaid || 0)), 0);
}

function buildWeekChart(orders: Order[], expenses: Expense[], weekStart: Date): BarData[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const key = toDateStr(d);
    const primary   = orders.filter(o => (o.createdAt || '').slice(0, 10) === key).reduce((s, o) => s + (o.amountPaid || 0), 0);
    const secondary = expenses.filter(e => e.date === key).reduce((s, e) => s + e.amount, 0);
    return { label: DAY_NAMES[i], primary, secondary };
  });
}

function buildMonthChart(orders: Order[], expenses: Expense[], year: number, month: number): BarData[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const weeks: { label: string; from: string; to: string }[] = [];
  let cur = new Date(firstDay);
  let wIdx = 1;
  while (cur <= lastDay) {
    const wEnd = new Date(cur);
    wEnd.setDate(cur.getDate() + 6);
    if (wEnd > lastDay) wEnd.setTime(lastDay.getTime());
    weeks.push({ label: `W${wIdx}`, from: toDateStr(cur), to: toDateStr(wEnd) });
    cur.setDate(cur.getDate() + 7);
    wIdx++;
  }
  return weeks.map(w => ({
    label:     w.label,
    primary:   filterOrdersByRange(orders, w.from, w.to).reduce((s, o) => s + (o.amountPaid || 0), 0),
    secondary: filterExpensesByRange(expenses, w.from, w.to).reduce((s, e) => s + e.amount, 0),
  }));
}

function buildAllTimeChart(orders: Order[], expenses: Expense[]): BarData[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const primary   = orders.filter(o => (o.createdAt || '').slice(0, 7) === key).reduce((s, o) => s + (o.amountPaid || 0), 0);
    const secondary = expenses.filter(e => e.date.slice(0, 7) === key).reduce((s, e) => s + e.amount, 0);
    return { label: MONTH_NAMES[d.getMonth()], primary, secondary };
  });
}

function getSourceCounts(orders: Order[]) {
  const counts: Record<string, number> = {};
  for (const o of orders) counts[o.source] = (counts[o.source] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function getTopProducts(orders: Order[]) {
  const counts: Record<string, number> = {};
  for (const o of orders) {
    const name = o.customName || o.items?.[0]?.productName || 'Custom';
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

const SOURCE_COLORS: Record<string, string> = {
  Instagram: '#E1306C',
  Facebook:  '#1877F2',
  WhatsApp:  '#25D366',
  Website:   '#6C63FF',
  Email:     '#F59E0B',
  Manual:    '#8B8B8B',
};

// ─── Main screen ───────────────────────────────────────────────────────────────

const PRIMARY_COLOR  = '#C06070';
const EXPENSE_COLOR  = '#E07070';

function fmt(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${Math.abs(v).toFixed(0)}`;
}

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { orders, expenses, addExpense, updateExpense, deleteExpense } = useDatabase();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [tab, setTab]                         = useState<Tab>('Month');
  const [weekOffset, setWeekOffset]           = useState(0);
  const [monthOffset, setMonthOffset]         = useState(0);
  const [expModalVisible, setExpModalVisible] = useState(false);
  const [editingExpense, setEditingExpense]   = useState<Expense | null>(null);

  const { fromDate, toDate, periodLabel, weekStart } = useMemo(() => {
    const now = new Date();
    if (tab === 'Week') {
      const base = getWeekStart(now);
      base.setDate(base.getDate() + weekOffset * 7);
      const end = new Date(base);
      end.setDate(base.getDate() + 6);
      return { fromDate: toDateStr(base), toDate: toDateStr(end), periodLabel: weekLabel(base), weekStart: base };
    }
    if (tab === 'Month') {
      const d    = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { fromDate: toDateStr(d), toDate: toDateStr(last), periodLabel: monthLabel(d.getFullYear(), d.getMonth()), weekStart: d };
    }
    return { fromDate: '0000-00-00', toDate: '9999-99-99', periodLabel: 'All Time', weekStart: new Date() };
  }, [tab, weekOffset, monthOffset]);

  const filteredOrders   = useMemo(() => tab === 'AllTime' ? orders   : filterOrdersByRange(orders, fromDate, toDate),     [orders,   tab, fromDate, toDate]);
  const filteredExpenses = useMemo(() => tab === 'AllTime' ? expenses : filterExpensesByRange(expenses, fromDate, toDate), [expenses, tab, fromDate, toDate]);

  const kpis = useMemo(() => {
    const revenue     = sumRevenue(filteredOrders);
    const totalExp    = sumExpenses(filteredExpenses);
    const netProfit   = revenue - totalExp;
    const outstanding = sumOutstanding(filteredOrders);
    const delivered   = filteredOrders.filter(o => o.status === 'Delivered').length;
    const total       = filteredOrders.length;
    const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    const overdue     = filteredOrders.filter(o => o.dueDate && o.status !== 'Delivered' && o.dueDate < toDateStr(new Date())).length;
    const avgOrder    = total > 0 ? revenue / total : 0;
    const margin      = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;
    return { revenue, totalExp, netProfit, outstanding, delivered, total, successRate, overdue, avgOrder, margin };
  }, [filteredOrders, filteredExpenses]);

  const chartData: BarData[] = useMemo(() => {
    if (tab === 'Week')    return buildWeekChart(filteredOrders, filteredExpenses, weekStart);
    if (tab === 'Month') {
      const d = new Date(fromDate);
      return buildMonthChart(filteredOrders, filteredExpenses, d.getFullYear(), d.getMonth());
    }
    return buildAllTimeChart(orders, expenses);
  }, [tab, filteredOrders, filteredExpenses, weekStart, fromDate, orders, expenses]);

  const sourceCounts   = useMemo(() => getSourceCounts(filteredOrders), [filteredOrders]);
  const topProducts    = useMemo(() => getTopProducts(filteredOrders),  [filteredOrders]);
  const sortedExpenses = useMemo(() =>
    [...filteredExpenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [filteredExpenses]
  );

  function handleDeleteExpense(id: string) {
    Alert.alert('Delete Expense', 'Remove this expense?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteExpense(id) },
    ]);
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Insights</Text>
          <Pressable onPress={() => setExpModalVisible(true)} style={styles.addBtn}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.addBtnText}>Expense</Text>
          </Pressable>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['Week','Month','AllTime'] as Tab[]).map(t => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, tab === t && { backgroundColor: PRIMARY_COLOR }]}
            >
              <Text style={[styles.tabText, { color: tab === t ? '#fff' : colors.mutedForeground }]}>
                {t === 'AllTime' ? 'All Time' : t}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Period navigator */}
        {tab !== 'AllTime' && (
          <View style={styles.periodNav}>
            <Pressable
              onPress={() => tab === 'Week' ? setWeekOffset(w => w - 1) : setMonthOffset(m => m - 1)}
              style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="chevron-left" size={16} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.periodLabel, { color: colors.foreground }]}>{periodLabel}</Text>
            <Pressable
              onPress={() => {
                if (tab === 'Week'  && weekOffset  < 0) setWeekOffset(w => w + 1);
                if (tab === 'Month' && monthOffset < 0) setMonthOffset(m => m + 1);
              }}
              style={[
                styles.navBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
                ((tab === 'Week' && weekOffset >= 0) || (tab === 'Month' && monthOffset >= 0)) && styles.navBtnDisabled,
              ]}
            >
              <Feather
                name="chevron-right"
                size={16}
                color={(tab === 'Week' && weekOffset >= 0) || (tab === 'Month' && monthOffset >= 0) ? colors.mutedForeground : colors.foreground}
              />
            </Pressable>
          </View>
        )}

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <KPICard label="Revenue"     value={fmt(kpis.revenue)}   icon="trending-up"  accent={PRIMARY_COLOR} />
            <KPICard label="Expenses"    value={fmt(kpis.totalExp)}  icon="shopping-bag" accent={EXPENSE_COLOR} />
          </View>
          <View style={styles.kpiRow}>
            <KPICard
              label="Net Profit"
              value={(kpis.netProfit < 0 ? '−' : '') + fmt(Math.abs(kpis.netProfit))}
              icon="activity"
              accent={kpis.netProfit >= 0 ? colors.deliveredText : colors.overdueText}
              trend={kpis.margin !== 0 ? `${kpis.margin}% margin` : undefined}
              trendUp={kpis.margin >= 0}
            />
            <KPICard label="Outstanding" value={fmt(kpis.outstanding)} icon="alert-circle" accent={kpis.outstanding > 0 ? colors.overdueText : colors.mutedForeground} />
          </View>
          <View style={styles.kpiRow}>
            <KPICard label="Orders"    value={String(kpis.total)}         icon="package"    />
            <KPICard label="Avg Order" value={fmt(kpis.avgOrder)}         icon="bar-chart-2" accent={PRIMARY_COLOR} />
          </View>
          <View style={styles.kpiRow}>
            <KPICard label="Success Rate" value={`${kpis.successRate}%`}  icon="check-circle" accent={colors.deliveredText} />
            <KPICard label="Overdue"      value={String(kpis.overdue)}    icon="clock"        accent={kpis.overdue > 0 ? colors.overdueText : colors.mutedForeground} />
          </View>
        </View>

        {/* Revenue vs Expenses chart */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Revenue vs Expenses</Text>
          <MiniBarChart data={chartData} height={140} primaryColor={PRIMARY_COLOR} secondaryColor={EXPENSE_COLOR} />
          {chartData.every(d => d.primary === 0 && (d.secondary ?? 0) === 0) && (
            <Text style={[styles.emptyChartText, { color: colors.mutedForeground }]}>No data for this period</Text>
          )}
        </View>

        {/* Orders by Source */}
        {sourceCounts.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Orders by Source</Text>
            {sourceCounts.map(([source, count]) => {
              const pct      = filteredOrders.length > 0 ? (count / filteredOrders.length) * 100 : 0;
              const barColor = SOURCE_COLORS[source] ?? PRIMARY_COLOR;
              return (
                <View key={source} style={styles.sourceRow}>
                  <View style={[styles.sourceDot, { backgroundColor: barColor }]} />
                  <Text style={[styles.sourceLabel, { color: colors.foreground }]}>{source}</Text>
                  <View style={[styles.sourceTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.sourceFill, { width: `${pct}%`, backgroundColor: barColor }]} />
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
                <View style={[styles.rank, { backgroundColor: i === 0 ? PRIMARY_COLOR : colors.muted }]}>
                  <Text style={[styles.rankText, { color: i === 0 ? '#fff' : colors.mutedForeground }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
                <Text style={[styles.productCount, { color: colors.mutedForeground }]}>{count} orders</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expense list */}
        {sortedExpenses.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Expenses</Text>
            {sortedExpenses.map(exp => (
              <Pressable
                key={exp.id}
                onPress={() => { setEditingExpense(exp); setExpModalVisible(true); }}
                onLongPress={() => handleDeleteExpense(exp.id)}
                style={[styles.expRow, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.catDot, { backgroundColor: EXPENSE_COLOR + '22' }]}>
                  <Feather name="tag" size={12} color={EXPENSE_COLOR} />
                </View>
                <View style={styles.expContent}>
                  <Text style={[styles.expCategory, { color: colors.foreground }]}>{exp.category}</Text>
                  {!!exp.note && <Text style={[styles.expNote, { color: colors.mutedForeground }]} numberOfLines={1}>{exp.note}</Text>}
                </View>
                <View style={styles.expRight}>
                  <Text style={[styles.expAmount, { color: EXPENSE_COLOR }]}>−{fmt(exp.amount)}</Text>
                  <Text style={[styles.expDate, { color: colors.mutedForeground }]}>{exp.date}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Empty state */}
        {orders.length === 0 && expenses.length === 0 && (
          <View style={styles.empty}>
            <Feather name="bar-chart-2" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No data yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Create orders or add expenses to see analytics
            </Text>
          </View>
        )}
      </ScrollView>

      <AddExpenseModal
        visible={expModalVisible}
        onClose={() => { setExpModalVisible(false); setEditingExpense(null); }}
        onSave={data => {
          if (editingExpense) updateExpense(editingExpense.id, data);
          else addExpense(data);
          setEditingExpense(null);
        }}
        initialExpense={editingExpense}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  title:          { fontSize: 28, fontFamily: 'Inter_700Bold' },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: PRIMARY_COLOR },
  addBtnText:     { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  tabBar:         { flexDirection: 'row', marginHorizontal: 16, borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 12 },
  tabBtn:         { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabText:        { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  periodNav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 },
  navBtn:         { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.35 },
  periodLabel:    { fontSize: 15, fontFamily: 'Inter_600SemiBold', minWidth: 120, textAlign: 'center' },
  kpiGrid:        { paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  kpiRow:         { flexDirection: 'row', gap: 10 },
  section:        { marginHorizontal: 16, marginBottom: 14, borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  sectionTitle:   { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyChartText: { textAlign: 'center', fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 8 },
  sourceRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceDot:      { width: 8, height: 8, borderRadius: 4 },
  sourceLabel:    { fontSize: 13, fontFamily: 'Inter_500Medium', width: 76 },
  sourceTrack:    { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  sourceFill:     { height: '100%', borderRadius: 4 },
  sourceCount:    { fontSize: 13, fontFamily: 'Inter_500Medium', width: 28, textAlign: 'right' },
  productRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank:           { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rankText:       { fontSize: 12, fontFamily: 'Inter_700Bold' },
  productName:    { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  productCount:   { fontSize: 13, fontFamily: 'Inter_400Regular' },
  expRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  catDot:         { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  expContent:     { flex: 1, gap: 2 },
  expCategory:    { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  expNote:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
  expRight:       { alignItems: 'flex-end', gap: 2 },
  expAmount:      { fontSize: 15, fontFamily: 'Inter_700Bold' },
  expDate:        { fontSize: 11, fontFamily: 'Inter_400Regular' },
  empty:          { alignItems: 'center', paddingTop: 64, gap: 12, paddingHorizontal: 40 },
  emptyTitle:     { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  emptyText:      { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
});


