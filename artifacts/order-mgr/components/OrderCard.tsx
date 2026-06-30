import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Order } from '@/types';
import { PaymentPill, StatusPill } from './StatusPill';

interface OrderCardProps {
  order: Order;
  isOverdue?: boolean;
}

const SOURCE_ICONS: Record<string, string> = {
  Instagram: 'instagram',
  Facebook: 'facebook',
  WhatsApp: 'message-circle',
  Website: 'globe',
  Email: 'mail',
  Manual: 'edit-3',
};

export function OrderCard({ order, isOverdue }: OrderCardProps) {
  const colors = useColors();
  const router = useRouter();

  const outstanding = order.price - order.amountPaid;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isOverdue ? '#FFB3BA' : colors.border,
          borderWidth: isOverdue ? 1.5 : 1,
          opacity: pressed ? 0.95 : 1,
          shadowColor: '#000',
        },
      ]}
      onPress={() => router.push(`/order/${order.id}` as any)}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          {order.thumbnailPath ? (
            <Image
              source={{ uri: order.thumbnailPath }}
              style={[styles.thumb, { borderRadius: colors.radius / 1.5 }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.thumbPlaceholder, { backgroundColor: colors.accent, borderRadius: colors.radius / 1.5 }]}>
              <Feather name={SOURCE_ICONS[order.source] as any || 'package'} size={18} color={colors.primary === '#F8BCCD' ? '#C06070' : colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.middle}>
          <View style={styles.nameRow}>
            <Text style={[styles.customerName, { color: colors.foreground }]} numberOfLines={1}>
              {order.customerName || 'Unknown'}
            </Text>
            {isOverdue && (
              <View style={[styles.overdueBadge, { backgroundColor: colors.overdue }]}>
                <Text style={[styles.overdueText, { color: colors.overdueText }]}>OVERDUE</Text>
              </View>
            )}
          </View>
          <Text style={[styles.productName, { color: colors.mutedForeground }]} numberOfLines={1}>
            {order.customName || 'Custom order'}
          </Text>
          <View style={styles.pills}>
            <StatusPill status={order.status} size="sm" />
            <View style={{ width: 6 }} />
            <PaymentPill status={order.paymentStatus} size="sm" />
          </View>
        </View>

        <View style={styles.right}>
          <Text style={[styles.price, { color: colors.foreground }]}>
            ₹{order.price.toFixed(2)}
          </Text>
          {outstanding > 0 && (
            <Text style={[styles.outstanding, { color: colors.overdueText }]}>
              -₹{outstanding.toFixed(2)}
            </Text>
          )}
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {order.dueDate ? `Due ${order.dueDate.slice(5)}` : order.orderDate?.slice(5) || ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  left: {},
  thumb: { width: 52, height: 52 },
  thumbPlaceholder: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customerName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', flex: 1 },
  productName: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  pills: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  outstanding: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  date: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  overdueBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  overdueText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
});
