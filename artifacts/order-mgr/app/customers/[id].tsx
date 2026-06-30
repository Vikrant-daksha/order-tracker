import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

export default function CustomerDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders } = useDatabase();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const customerName = decodeURIComponent(id || '');
  const customerOrders = useMemo(() =>
    orders.filter(o => o.customerName === customerName).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, customerName]
  );

  const stats = useMemo(() => ({
    total: customerOrders.length,
    spent: customerOrders.reduce((s, o) => s + o.amountPaid, 0),
    outstanding: customerOrders.reduce((s, o) => s + Math.max(0, o.price - o.amountPaid), 0),
    lastOrder: customerOrders[0]?.orderDate || '—',
    contactInfo: customerOrders[0]?.contactInfo || '—',
    sources: [...new Set(customerOrders.map(o => o.source))],
  }), [customerOrders]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={customerOrders}
        keyExtractor={o => o.id}
        renderItem={({ item }) => <OrderCard order={item} isOverdue={isOverdue(item)} />}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 40 : insets.bottom + 20 }}
        scrollEnabled={customerOrders.length > 0}
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
              <Pressable onPress={() => router.back()}>
                <Feather name="arrow-left" size={22} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{customerName}</Text>
              <View style={{ width: 22 }} />
            </View>

            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={[styles.avatarText, { color: '#C06070' }]}>{customerName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={[styles.name, { color: colors.foreground }]}>{customerName}</Text>
              {stats.contactInfo !== '—' && (
                <Text style={[styles.contact, { color: colors.mutedForeground }]}>{stats.contactInfo}</Text>
              )}
              {stats.sources.length > 0 && (
                <View style={styles.sources}>
                  {stats.sources.map(s => (
                    <View key={s} style={[styles.sourceChip, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.sourceText, { color: colors.mutedForeground }]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.statsRow}>
              <StatBox label="Orders" value={String(stats.total)} colors={colors} />
              <StatBox label="Total Spent" value={`₹${stats.spent.toFixed(0)}`} colors={colors} />
              <StatBox label="Outstanding" value={`₹${stats.outstanding.toFixed(0)}`} colors={colors} accent={stats.outstanding > 0} />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Order History</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No orders found</Text>
          </View>
        }
      />
    </View>
  );
}

function StatBox({ label, value, colors, accent }: any) {
  return (
    <View style={[styles.statBox, { backgroundColor: accent ? colors.unpaid : colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: accent ? colors.unpaidText : colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', flex: 1, textAlign: 'center' },
  profileCard: {
    margin: 16, borderRadius: 16, borderWidth: 1, padding: 20,
    alignItems: 'center', gap: 8,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  contact: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  sourceChip: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  sourceText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 16, marginBottom: 8 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
