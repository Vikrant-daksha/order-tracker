import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaymentPill, StatusPill } from '@/components/StatusPill';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { cancelOrderReminder, scheduleOrderReminder } from '@/utils/notifications';

const SOURCE_ICONS: Record<string, string> = {
  Instagram: 'instagram',
  Facebook: 'facebook',
  WhatsApp: 'message-circle',
  Website: 'globe',
  Email: 'mail',
  Manual: 'edit-3',
};

function buildMessage(order: any): string {
  const lines: string[] = [
    `Hi ${order.customerName}!`,
    `Your order "${order.customName || 'item'}" has been ${order.status.toLowerCase()}.`,
  ];
  if (order.trackingLink) lines.push(`Track your package: ${order.trackingLink}`);
  lines.push('Thank you for your order!');
  return lines.join('\n');
}

export default function OrderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getOrder, deleteOrder, updateOrder } = useDatabase();
  const order = getOrder(id);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Order not found</Text>
        </View>
      </View>
    );
  }

  const outstanding = order.price - order.amountPaid;
  const message = buildMessage(order);

  function handleSend() {
    const source = order.source;
    if (source === 'WhatsApp') {
      const phone = order.contactInfo?.replace(/[^0-9+]/g, '');
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      Linking.openURL(url);
    } else if (source === 'Email') {
      const subject = encodeURIComponent(`Order Update - ${order.customName || 'Your Order'}`);
      const body = encodeURIComponent(message);
      const email = order.contactInfo || '';
      Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
    } else {
      Clipboard.setStringAsync(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Message Copied',
        `The message has been copied. Open ${source} to paste and send it to ${order.contactInfo || 'the customer'}.`,
        [
          { text: 'OK' },
          source === 'Instagram'
            ? { text: 'Open Instagram', onPress: () => Linking.openURL('instagram://') }
            : { text: 'Open Facebook', onPress: () => Linking.openURL('fb://') },
        ]
      );
    }
  }

  function handleTrackingLink() {
    if (order.trackingLink) {
      const url = order.trackingLink.startsWith('http') ? order.trackingLink : `https://${order.trackingLink}`;
      Linking.openURL(url);
    }
  }

  async function handleAdvanceStatus() {
    const next: Record<string, string> = { Confirmed: 'Shipped', Shipped: 'Delivered' };
    const nextStatus = next[order.status];
    if (!nextStatus) return;
    await updateOrder(order.id, { status: nextStatus as any });
    if (nextStatus === 'Delivered') {
      await cancelOrderReminder(order.id);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function confirmDelete() {
    Alert.alert('Delete Order', 'This order will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await cancelOrderReminder(order.id);
          await deleteOrder(order.id);
          router.back();
        }
      },
    ]);
  }

  const STATUSES = ['Confirmed', 'Shipped', 'Delivered'];
  const statusIndex = STATUSES.indexOf(order.status);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={[styles.orderId, { color: colors.mutedForeground }]}>#{order.id.slice(-6).toUpperCase()}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push({ pathname: '/order/new', params: { id: order.id } } as any)}>
            <Feather name="edit-2" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={confirmDelete}>
            <Feather name="trash-2" size={20} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === 'web' ? 60 : insets.bottom + 30 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image */}
        {order.referenceImagePath ? (
          <Image
            source={{ uri: order.referenceImagePath }}
            style={[styles.heroImage, { borderRadius: colors.radius + 4 }]}
            contentFit="cover"
          />
        ) : null}

        {/* Customer Info Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.customerHeader}>
            <View style={[styles.sourceIcon, { backgroundColor: colors.accent }]}>
              <Feather name={SOURCE_ICONS[order.source] as any || 'package'} size={18} color="#C06070" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.customerName, { color: colors.foreground }]}>{order.customerName}</Text>
              {order.contactInfo ? order.contactInfo.split('\n').map((line, i) => {
                if (!line.trim()) return null;
                const icon = i === 0 ? 'at-sign' : i === 1 ? 'phone' : 'mail';
                return (
                  <Text key={i} style={[styles.contactInfo, { color: colors.mutedForeground }]}>
                    {line}
                  </Text>
                );
              }) : null}
              {order.address ? (
                <Text style={[styles.contactInfo, { color: colors.mutedForeground }]} numberOfLines={2}>
                  📍 {order.address}
                </Text>
              ) : null}
            </View>
            <StatusPill status={order.status} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoGrid}>
            <InfoItem label="Product" value={order.customName || '—'} colors={colors} />
            <InfoItem label="Source" value={order.source} colors={colors} />
            <InfoItem label="Order Date" value={formatDate(order.orderDate)} colors={colors} />
            <InfoItem label="Due Date" value={formatDate(order.dueDate)} colors={colors} />
          </View>

          {/* Due-date reminder hint */}
          {order.dueDate && order.status !== 'Delivered' && (() => {
            const due = new Date(`${order.dueDate}T00:00:00`);
            const reminder = new Date(due);
            reminder.setDate(due.getDate() - 2);
            reminder.setHours(10, 0, 0, 0);
            if (reminder > new Date()) {
              return (
                <View style={[styles.reminderBanner, { backgroundColor: colors.accent }]}>
                  <Feather name="bell" size={13} color="#C06070" />
                  <Text style={[styles.reminderText, { color: '#8B4D5C' }]}>
                    Reminder set for {formatDate(reminder.toISOString().split('T')[0])} at 10:00 AM
                  </Text>
                </View>
              );
            }
            return null;
          })()}
        </View>

        {/* Payment Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Payment</Text>
          <View style={styles.paymentRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Total</Text>
              <Text style={[styles.priceValue, { color: colors.foreground }]}>₹{order.price.toFixed(2)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Paid</Text>
              <Text style={[styles.priceValue, { color: colors.deliveredText }]}>₹{order.amountPaid.toFixed(2)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Balance</Text>
              <Text style={[styles.priceValue, { color: outstanding > 0 ? colors.overdueText : colors.deliveredText }]}>
                ₹{outstanding.toFixed(2)}
              </Text>
            </View>
          </View>
          <PaymentPill status={order.paymentStatus} />
        </View>

        {/* Status Timeline */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Status Timeline</Text>
          <View style={styles.timeline}>
            {STATUSES.map((s, i) => {
              const done = i <= statusIndex;
              const active = i === statusIndex;
              return (
                <View key={s} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={[
                      styles.timelineDot,
                      { backgroundColor: done ? colors.primary : colors.muted, borderColor: active ? '#C06070' : 'transparent' }
                    ]}>
                      {done && <Feather name="check" size={12} color={colors.primaryForeground} />}
                    </View>
                    {i < STATUSES.length - 1 && (
                      <View style={[styles.timelineLine, { backgroundColor: i < statusIndex ? colors.primary : colors.border }]} />
                    )}
                  </View>
                  <Text style={[styles.timelineLabel, { color: done ? colors.foreground : colors.mutedForeground, fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                    {s}
                  </Text>
                </View>
              );
            })}
          </View>
          {order.status !== 'Delivered' && (
            <Pressable
              onPress={handleAdvanceStatus}
              style={[styles.advanceBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.advanceBtnText, { color: colors.primaryForeground }]}>
                Mark as {order.status === 'Confirmed' ? 'Shipped' : 'Delivered'}
              </Text>
              <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
            </Pressable>
          )}
        </View>

        {/* Tracking */}
        {order.trackingLink ? (
          <Pressable
            onPress={handleTrackingLink}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
          >
            <View style={[styles.sourceIcon, { backgroundColor: colors.accent }]}>
              <Feather name="truck" size={18} color="#C06070" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Tracking</Text>
              <Text style={[styles.trackingLink, { color: '#C06070' }]} numberOfLines={1}>{order.trackingLink}</Text>
            </View>
            <Feather name="external-link" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}

        {/* Notes */}
        {order.notes ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Notes</Text>
            <Text style={[styles.notes, { color: colors.mutedForeground }]}>{order.notes}</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <Pressable
          onPress={handleSend}
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="send" size={18} color={colors.primaryForeground} />
          <Text style={[styles.sendBtnText, { color: colors.primaryForeground }]}>Send to Customer</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function InfoItem({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerMid: { flex: 1, alignItems: 'center' },
  orderId: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  headerActions: { flexDirection: 'row', gap: 16 },
  heroImage: { width: '100%', height: 200, marginBottom: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12, gap: 12 },
  customerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sourceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  customerName: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  contactInfo: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  infoItem: { width: '44%', gap: 3 },
  infoLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  reminderBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  reminderText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  paymentRow: { flexDirection: 'row' },
  priceLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  priceValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 24 },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  timelineLine: { width: 2, height: 24, marginTop: 2 },
  timelineLabel: { fontSize: 15, paddingTop: 3 },
  advanceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12 },
  advanceBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  trackingLink: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  notes: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 14 },
  sendBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
});
