import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/OrderCard';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order } from '@/types';

function isOverdue(order: Order) {
  if (!order.dueDate || order.status === 'Delivered') return false;
  return order.dueDate < new Date().toISOString().split('T')[0];
}

function isDueToday(order: Order) {
  return order.dueDate === new Date().toISOString().split('T')[0];
}

function isDueThisWeek(order: Order) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + 7);
  const due = new Date(order.dueDate);
  return due >= today && due <= end;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders, loading } = useDatabase();

  const active = useMemo(() => orders.filter(o => o.status !== 'Delivered'), [orders]);
  const overdue = useMemo(() => active.filter(isOverdue), [active]);
  const dueToday = useMemo(() => active.filter(isDueToday), [active]);
  const dueThisWeek = useMemo(() => active.filter(o => !isDueToday(o) && isDueThisWeek(o)), [active]);
  const outstanding = useMemo(() => orders.reduce((s, o) => s + Math.max(0, o.price - o.amountPaid), 0), [orders]);
  const unpaidCount = useMemo(() => orders.filter(o => o.paymentStatus !== 'Paid').length, [orders]);

  const featured = useMemo(() => [
    ...overdue.slice(0, 3),
    ...dueToday.filter(o => !isOverdue(o)).slice(0, 3),
    ...dueThisWeek.slice(0, 3),
  ].slice(0, 10), [overdue, dueToday, dueThisWeek]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  function handleNewOrder() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/order/new' as any);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={featured}
        keyExtractor={o => o.id}
        renderItem={({ item }) => <OrderCard order={item} isOverdue={isOverdue(item)} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }}
        scrollEnabled={featured.length > 0}
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingTop: topPad + 8 }]}>
              <View>
                <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Dashboard</Text>
              </View>
              <Pressable
                onPress={() => router.push('/kanban' as any)}
                style={[styles.kanbanBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="columns" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <StatCard
                label="Overdue"
                value={String(overdue.length)}
                color={overdue.length > 0 ? colors.overdueText : colors.mutedForeground}
                bg={overdue.length > 0 ? colors.overdue : colors.card}
                icon="alert-circle"
                colors={colors}
              />
              <StatCard
                label="Due Today"
                value={String(dueToday.length)}
                color={colors.shippedText}
                bg={colors.shipped}
                icon="clock"
                colors={colors}
              />
              <StatCard
                label="Outstanding"
                value={`₹${outstanding.toFixed(0)}`}
                color={unpaidCount > 0 ? colors.unpaidText : colors.mutedForeground}
                bg={unpaidCount > 0 ? colors.unpaid : colors.card}
                icon="dollar-sign"
                colors={colors}
              />
            </View>

            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {featured.length > 0 ? 'Needs Attention' : 'All caught up'}
              </Text>
              <Pressable onPress={() => router.push('/orders' as any)}>
                <Text style={[styles.seeAll, { color: '#C06070' }]}>See all</Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="check-circle" size={48} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing urgent</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No overdue or upcoming orders. Great work!
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={handleNewOrder}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 80 }]}
      >
        <Feather name="plus" size={26} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

function StatCard({ label, value, color, bg, icon, colors }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <Feather name={icon} size={14} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  greeting: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  kanbanBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  seeAll: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  empty: { alignItems: 'center', paddingTop: 48, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
});
