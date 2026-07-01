import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useState, useCallback } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/OrderCard';
import { FilterChips } from '@/components/FilterChips';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order, OrderStatus } from '@/types';



type FilterOption = 'All' | OrderStatus;
const FILTERS: FilterOption[] = ['All', 'Confirmed', 'Shipped', 'Delivered'];

function isOverdue(order: Order) {
  if (!order.dueDate || order.status === 'Delivered') return false;
  return order.dueDate < new Date().toISOString().split('T')[0];
}

function formatDateHeader(dateStr: string): string {
  if (!dateStr) return 'Unknown Date';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const dayNum = parseInt(d, 10);
  const monthName = months[parseInt(m, 10) - 1] || '';
  return `${dayNum}, ${monthName} ${y}`;
}

interface DateGroup {
  date: string;
  label: string;
  orders: Order[];
}

function groupOrdersByDate(orders: Order[]): DateGroup[] {
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.orderDate || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  // Sort date keys descending
  const sorted = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  return sorted.map(([date, grpOrders]) => ({
    date,
    label: formatDateHeader(date),
    orders: grpOrders,
  }));
}

// ── Collapsible Date Group ────────────────────────────────────────────────────

function DateGroupSection({ group, defaultOpen }: { group: DateGroup; defaultOpen: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    setOpen(v => !v);
    Haptics.selectionAsync();
  }, []);

  return (
    <View style={styles.groupContainer}>
      {/* Date header */}
      <Pressable style={styles.dateHeader} onPress={toggle}>
        <Text style={[styles.dateLabel, { color: colors.foreground }]}>{group.label}</Text>
        <View style={styles.dateHeaderRight}>
          <View style={[styles.countBadge, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <Text style={[styles.countBadgeText, { color: colors.mutedForeground }]}>{group.orders.length}</Text>
          </View>
          <Feather
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.mutedForeground}
          />
        </View>
      </Pressable>

      {/* Orders in group */}
      {open && (
        <View style={styles.groupOrders}>
          {group.orders.map(order => (
            <OrderCard key={order.id} order={order} isOverdue={isOverdue(order)} />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders } = useDatabase();
  const [filter, setFilter] = useState<FilterOption>('All');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const filtered = useMemo(() => {
    let list = filter === 'All' ? orders : orders.filter(o => o.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(q) ||
        o.customName.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.source.toLowerCase().includes(q) ||
        o.trackingLink.toLowerCase().includes(q) ||
        o.contactInfo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filter, search]);

  const groups = useMemo(() => groupOrdersByDate(filtered), [filtered]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={groups}
        keyExtractor={g => g.date}
        renderItem={({ item, index }) => (
          <DateGroupSection group={item} defaultOpen={index === 0} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }}
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingTop: topPad + 8 }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>Orders</Text>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length}</Text>
            </View>

            <View style={[styles.searchBar, {
              backgroundColor: colors.card,
              borderColor: searchFocused ? colors.primary : colors.border,
              marginHorizontal: 16,
              marginBottom: 12,
            }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search orders..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')}>
                  <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>

            <FilterChips
              options={FILTERS}
              selected={filter}
              onSelect={v => { setFilter(v); Haptics.selectionAsync(); }}
              style={{ marginBottom: 12 }}
            />
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No orders</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? 'No orders match your search' : 'Tap + to create your first order'}
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/order/new' as any);
        }}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 80 }]}
      >
        <Feather name="plus" size={26} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', flex: 1 },
  count: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  // Date group
  groupContainer: { marginBottom: 4 },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  dateHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4 },
  countBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  countBadgeText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  groupOrders: {},
  // Empty
  empty: { alignItems: 'center', paddingTop: 64, gap: 12, paddingHorizontal: 40 },
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
