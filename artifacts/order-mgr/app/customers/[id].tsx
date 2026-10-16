import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/OrderCard';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order } from '@/types';

function isOverdue(order: Order) {
  if (!order.dueDate || order.status === 'Delivered' || order.status === 'Shipped' || order.status === 'Completed') return false;
  return order.dueDate < new Date().toISOString().split('T')[0];
}

export default function CustomerDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: customerId } = useLocalSearchParams<{ id: string }>();
  const { orders, customers } = useDatabase();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const customer = useMemo(() => customers.find(c => c.id === customerId), [customers, customerId]);
  const customerName = customer?.name || 'Unknown';

  const customerOrders = useMemo(() =>
    orders.filter(o => o.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, customerId]
  );

  const sizeImages = useMemo(() => {
    if (customer?.sizeImagePaths && customer.sizeImagePaths.length > 0) return customer.sizeImagePaths;
    if (customer?.sizeImagePath) return [customer.sizeImagePath];
    return [];
  }, [customer]);

  const stats = useMemo(() => ({
    total: customerOrders.length,
    spent: customerOrders.reduce((s, o) => s + o.amountPaid, 0),
    outstanding: customerOrders.reduce((s, o) => s + Math.max(0, o.price - o.amountPaid), 0),
    lastOrder: customerOrders[0]?.orderDate || '—',
    contactInfo: [customer?.igHandle ? `@${customer.igHandle}` : null, customer?.phone].filter(Boolean).join('\n') || '—',
    sources: [...new Set(customerOrders.map(o => o.source))],
  }), [customerOrders, customer]);

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
              <Pressable
                onPress={() => router.push(`/customers/edit/${customerId}` as any)}
                hitSlop={8}
              >
                <Feather name="edit-2" size={19} color="#C06070" />
              </Pressable>
            </View>

            <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={[styles.avatarText, { color: '#C06070' }]}>{customerName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={[styles.name, { color: colors.foreground }]}>{customerName}</Text>
              {stats.contactInfo !== '—' && (
                <Text style={[styles.contact, { color: colors.mutedForeground }]}>{stats.contactInfo}</Text>
              )}
              {!!customer?.address && (
                <Text style={[styles.address, { color: colors.mutedForeground }]} numberOfLines={2}>
                  📍 {customer.address}
                </Text>
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

              {/* Customer Size / Measurements */}
              {!!customer?.size && (
                <View style={[styles.sizeBox, { backgroundColor: colors.accent, borderColor: '#C0607033' }]}>
                  <View style={styles.sizeHeader}>
                    <Feather name="maximize-2" size={13} color="#C06070" />
                    <Text style={styles.sizeHeaderTitle}>Standard Size / Measurements</Text>
                  </View>
                  <Text style={[styles.sizeBody, { color: colors.foreground }]}>{customer.size}</Text>
                </View>
              )}

              {/* Customer Size Photos */}
              {sizeImages.length > 0 && (
                <View style={styles.sizeImagesContainer}>
                  <View style={styles.sizeImagesHeader}>
                    <Feather name="image" size={13} color="#C06070" />
                    <Text style={styles.sizeImagesTitle}>
                      Size & Measurement Photos ({sizeImages.length})
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                  >
                    {sizeImages.map((uri, idx) => (
                      <Pressable key={uri + idx} onPress={() => setPreviewImage(uri)} style={styles.sizeImageWrapper}>
                        <Image
                          source={{ uri }}
                          style={[styles.sizeImageThumb, { borderColor: colors.border }]}
                          contentFit="cover"
                        />
                        <View style={styles.zoomBadge}>
                          <Feather name="zoom-in" size={11} color="#fff" />
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {!!customer?.notes && (
                <View style={[styles.notesBox, { backgroundColor: colors.accent, borderColor: '#C0607033' }]}>
                  <View style={styles.notesHeader}>
                    <Feather name="file-text" size={13} color="#C06070" />
                    <Text style={styles.notesHeaderTitle}>Additional Notes</Text>
                  </View>
                  <Text style={[styles.notesBody, { color: colors.foreground }]}>{customer.notes}</Text>
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

      {/* Fullscreen Size Image Viewer Modal */}
      <Modal
        visible={!!previewImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPreviewImage(null)}
        >
          <View style={styles.modalContent}>
            <Pressable
              style={styles.closeBtn}
              onPress={() => setPreviewImage(null)}
            >
              <Feather name="x" size={20} color="#fff" />
            </Pressable>
            {previewImage && (
              <Image
                source={{ uri: previewImage }}
                style={styles.modalImage}
                contentFit="contain"
              />
            )}
          </View>
        </Pressable>
      </Modal>
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
  address: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: -2 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  sourceChip: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  sourceText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  sizeBox: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 6,
    gap: 4,
  },
  sizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sizeHeaderTitle: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#C06070',
    letterSpacing: 0.3,
  },
  sizeBody: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
  },
  sizeImagesContainer: {
    width: '100%',
    marginTop: 6,
  },
  sizeImagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sizeImagesTitle: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#C06070',
  },
  sizeImageWrapper: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
  },
  sizeImageThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 3,
  },
  notesBox: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 6,
    gap: 4,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notesHeaderTitle: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#C06070',
  },
  notesBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  statBox: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 16, marginBottom: 8 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 8,
  },
});
