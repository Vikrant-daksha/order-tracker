import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusPill } from '@/components/StatusPill';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order, OrderStatus } from '@/types';

const COLUMNS: OrderStatus[] = ['Confirmed', 'Shipped', 'Delivered'];

function isOverdue(order: Order) {
  if (!order.dueDate || order.status === 'Delivered') return false;
  return order.dueDate < new Date().toISOString().split('T')[0];
}

export default function KanbanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders, updateOrder } = useDatabase();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const grouped = useMemo(() => {
    const map: Record<OrderStatus, Order[]> = { Confirmed: [], Shipped: [], Delivered: [] };
    for (const o of orders) {
      if (map[o.status]) map[o.status].push(o);
    }
    return map;
  }, [orders]);

  async function advanceStatus(order: Order) {
    const next: Record<string, OrderStatus> = { Confirmed: 'Shipped', Shipped: 'Delivered' };
    const nextStatus = next[order.status];
    if (!nextStatus) return;
    await updateOrder(order.id, { status: nextStatus });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const colColors = {
    Confirmed: colors.confirmed,
    Shipped: colors.shipped,
    Delivered: colors.delivered,
  };
  const colTextColors = {
    Confirmed: colors.confirmedText,
    Shipped: colors.shippedText,
    Delivered: colors.deliveredText,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Kanban Board</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        {COLUMNS.map(col => (
          <View key={col} style={[styles.column, { width: 280 }]}>
            <View style={[styles.colHeader, { backgroundColor: colColors[col] }]}>
              <Text style={[styles.colTitle, { color: colTextColors[col] }]}>{col}</Text>
              <View style={[styles.colBadge, { backgroundColor: colTextColors[col] }]}>
                <Text style={[styles.colCount, { color: colColors[col] }]}>{grouped[col].length}</Text>
              </View>
            </View>

            <FlatList
              data={grouped[col]}
              keyExtractor={o => o.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 10, gap: 10, paddingBottom: Platform.OS === 'web' ? 40 : insets.bottom + 20 }}
              scrollEnabled={!!grouped[col].length}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push(`/order/${item.id}` as any)}
                  style={({ pressed }) => [
                    styles.kanbanCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: isOverdue(item) ? '#FFB3BA' : colors.border,
                      borderWidth: isOverdue(item) ? 1.5 : 1,
                      opacity: pressed ? 0.9 : 1,
                    }
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardCustomer, { color: colors.foreground }]} numberOfLines={1}>
                      {item.customerName}
                    </Text>
                    {isOverdue(item) && (
                      <View style={[styles.overdueDot, { backgroundColor: colors.overdueText }]} />
                    )}
                  </View>
                  <Text style={[styles.cardProduct, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {item.customName || 'Custom order'}
                  </Text>
                  <View style={styles.cardBottom}>
                    <Text style={[styles.cardPrice, { color: colors.foreground }]}>₹{item.price.toFixed(2)}</Text>
                    {item.dueDate && (
                      <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>Due {item.dueDate.slice(5)}</Text>
                    )}
                  </View>
                  {col !== 'Delivered' && (
                    <Pressable
                      onPress={() => advanceStatus(item)}
                      style={[styles.advanceBtn, { backgroundColor: colColors[col] }]}
                    >
                      <Text style={[styles.advanceBtnText, { color: colTextColors[col] }]}>
                        {col === 'Confirmed' ? 'Mark Shipped' : 'Mark Delivered'}
                      </Text>
                      <Feather name="arrow-right" size={12} color={colTextColors[col]} />
                    </Pressable>
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyCol}>
                  <Text style={[styles.emptyColText, { color: colors.mutedForeground }]}>No orders</Text>
                </View>
              }
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  column: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#E5E5EA' },
  colHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  colTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  colBadge: { borderRadius: 100, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  colCount: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  kanbanCard: {
    borderRadius: 12, padding: 14, gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardCustomer: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  overdueDot: { width: 8, height: 8, borderRadius: 4 },
  cardProduct: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardPrice: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  cardDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  advanceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 8, paddingVertical: 8,
  },
  advanceBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  emptyCol: { padding: 20, alignItems: 'center' },
  emptyColText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
