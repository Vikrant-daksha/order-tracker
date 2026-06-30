import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { CustomerProfile } from '@/types';

export default function CustomersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders } = useDatabase();
  const [search, setSearch] = useState('');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const customers = useMemo((): CustomerProfile[] => {
    const map: Record<string, CustomerProfile> = {};
    for (const o of orders) {
      const key = o.customerName?.trim() || 'Unknown';
      if (!map[key]) {
        map[key] = { customerName: key, contactInfo: o.contactInfo, totalOrders: 0, totalSpent: 0, lastOrderDate: o.orderDate, isRepeat: false };
      }
      map[key].totalOrders++;
      map[key].totalSpent += o.amountPaid;
      if (o.orderDate > map[key].lastOrderDate) map[key].lastOrderDate = o.orderDate;
      if (!map[key].contactInfo && o.contactInfo) map[key].contactInfo = o.contactInfo;
    }
    const list = Object.values(map);
    list.forEach(c => { c.isRepeat = c.totalOrders > 1; });
    list.sort((a, b) => b.totalOrders - a.totalOrders);
    return list;
  }, [orders]);

  const filtered = search ? customers.filter(c =>
    c.customerName.toLowerCase().includes(search.toLowerCase()) ||
    c.contactInfo?.toLowerCase().includes(search.toLowerCase())
  ) : customers;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={c => c.customerName}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 40 : insets.bottom + 20 }}
        scrollEnabled={filtered.length > 0}
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingTop: topPad + 8 }]}>
              <Pressable onPress={() => router.back()}>
                <Feather name="arrow-left" size={22} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.title, { color: colors.foreground }]}>Customers</Text>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length}</Text>
            </View>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16, marginBottom: 12 }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search customers..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
            </View>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/customers/[id]', params: { id: encodeURIComponent(item.customerName) } } as any)}
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
          >
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: '#C06070' }]}>{item.customerName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.customerName}</Text>
                {item.isRepeat && (
                  <View style={[styles.repeatBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.repeatText, { color: colors.primaryForeground }]}>Repeat</Text>
                  </View>
                )}
              </View>
              {item.contactInfo ? <Text style={[styles.contact, { color: colors.mutedForeground }]}>{item.contactInfo}</Text> : null}
              <View style={styles.statsRow}>
                <Text style={[styles.statText, { color: colors.mutedForeground }]}>{item.totalOrders} order{item.totalOrders !== 1 ? 's' : ''}</Text>
                <Text style={[styles.statDot, { color: colors.mutedForeground }]}>·</Text>
                <Text style={[styles.statText, { color: colors.mutedForeground }]}>₹{item.totalSpent.toFixed(2)} spent</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No customers yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Customers appear automatically when you create orders.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', flex: 1 },
  count: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  repeatBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  repeatText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  contact: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  statDot: { fontSize: 12 },
  empty: { alignItems: 'center', paddingTop: 64, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
