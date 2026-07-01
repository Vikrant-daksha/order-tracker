import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order } from '@/types';
import { PaymentPill, StatusPill } from './StatusPill';

interface OrderCardProps {
  order: Order;
  isOverdue?: boolean;
  /** Optional: parent can pass a setter to disable its scroll while swiping */
  onSwipeActive?: (active: boolean) => void;
}

const SOURCE_ICONS: Record<string, string> = {
  Instagram: 'instagram',
  Facebook: 'facebook',
  WhatsApp: 'message-circle',
  Website: 'globe',
  Email: 'mail',
  Manual: 'edit-3',
};

function formatDdMm(iso: string): string {
  if (!iso) return '';
  return `${iso.slice(8)}-${iso.slice(5, 7)}`;
}

// How far left the user must drag to trigger the action
const SWIPE_THRESHOLD = 80;
// Max visible reveal (card slides this far at most)
const MAX_SLIDE = 90;

export function OrderCard({ order, isOverdue, onSwipeActive }: OrderCardProps) {
  const colors = useColors();
  const router = useRouter();
  const { toggleWorkingOn } = useDatabase();

  const outstanding = order.price - order.amountPaid;
  const isWorking = !!order.workingOn;

  const translateX = useRef(new Animated.Value(0)).current;
  const swiping = useRef(false);

  const accentColor = isWorking ? '#C06070' : isOverdue ? '#B71C1C' : colors.mutedForeground;
  const cardBorderColor = isWorking ? '#C06070' : isOverdue ? '#FFB3BA' : colors.border;
  const dueDateDdMm = order.dueDate ? formatDdMm(order.dueDate) : null;

  const handleToggle = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toggleWorkingOn(order.id);
  }, [order.id, toggleWorkingOn]);

  const snapBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();
    onSwipeActive?.(false);
    swiping.current = false;
  }, [translateX, onSwipeActive]);

  const panResponder = useRef(
    PanResponder.create({
      // Only intercept clearly horizontal movement (dx > dy prevents scroll conflict)
      onMoveShouldSetPanResponder: (_, g) =>
        !swiping.current &&
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5,

      onPanResponderGrant: () => {
        swiping.current = true;
        onSwipeActive?.(true); // Disable parent list scroll during swipe
      },

      onPanResponderMove: (_, g) => {
        // Only slide LEFT (negative dx)
        const val = Math.max(-MAX_SLIDE, Math.min(0, g.dx));
        translateX.setValue(val);
      },

      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_THRESHOLD) {
          // Trigger toggle immediately for zero-delay feel
          handleToggle();

          // Smoothly snap back card to 0
          Animated.spring(translateX, {
            toValue: 0,
            tension: 120,
            friction: 12,
            useNativeDriver: true,
          }).start(() => {
            onSwipeActive?.(false); // Re-enable parent scroll
            swiping.current = false;
          });
        } else {
          snapBack();
        }
      },

      onPanResponderTerminate: () => snapBack(),
    })
  ).current;

  // Background action opacity from slide amount
  const actionOpacity = translateX.interpolate({
    inputRange: [-MAX_SLIDE, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const actionScale = translateX.interpolate({
    inputRange: [-MAX_SLIDE, 0],
    outputRange: [1, 0.5],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.wrapper, { marginHorizontal: 16, marginVertical: 5 }]}>
      {/* ── Background action — revealed on left swipe ── */}
      <Animated.View
        style={[
          styles.actionBg,
          {
            backgroundColor: '#FFE4EE',
            opacity: actionOpacity,
          },
        ]}
      >
        <Animated.View
          style={{
            transform: [{ scale: actionScale }],
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Feather
            name={isWorking ? 'x-circle' : 'tool'}
            size={22}
            color="#8B4D5C"
          />
          <Text style={[styles.actionLabel, { color: '#8B4D5C' }]}>
            {isWorking ? 'Remove WIP' : 'Mark WIP'}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* ── Sliding card — drags left ── */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: cardBorderColor,
            borderWidth: isWorking || isOverdue ? 1.5 : 1,
            transform: [{ translateX }],
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
          onPress={() => router.push(`/order/${order.id}` as any)}
        >
          <View style={styles.inner}>
            {/* Left: thumbnail or icon */}
            <View>
              {order.thumbnailPath ? (
                <Image
                  source={{ uri: order.thumbnailPath }}
                  style={[styles.thumb, { borderRadius: 10 }]}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: isWorking ? '#FDEEF0' : colors.accent, borderRadius: 10 },
                  ]}
                >
                  <Feather
                    name={(SOURCE_ICONS[order.source] as any) || 'package'}
                    size={17}
                    color="#C06070"
                  />
                </View>
              )}
              {isWorking && (
                <View
                  style={[styles.workingDot, { backgroundColor: '#C06070', borderColor: colors.card }]}
                />
              )}
            </View>

            {/* Middle: name + product + pills */}
            <View style={styles.middle}>
              <View style={styles.nameRow}>
                <Text
                  style={[styles.customerName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {order.customerName || 'Unknown'}
                </Text>
                {isWorking && (
                  <View style={[styles.workingPill, { backgroundColor: '#C06070' }]}>
                    <Feather name="tool" size={9} color="#fff" />
                    <Text style={styles.workingLabel}>WIP</Text>
                  </View>
                )}
              </View>

              <Text
                style={[styles.productName, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {order.customName || 'Custom order'}
              </Text>

              <View style={styles.pillsRow}>
                <StatusPill status={order.status} size="sm" />
                <View style={styles.pillGap} />
                <PaymentPill status={order.paymentStatus} size="sm" />
              </View>
            </View>

            {/* Right: due date chip + price stacked */}
            <View style={styles.right}>
              {dueDateDdMm ? (
                <View
                  style={[
                    styles.dueDateChip,
                    {
                      backgroundColor:
                        isOverdue && !isWorking ? colors.overdue : colors.accent,
                    },
                  ]}
                >
                  {isOverdue && !isWorking && (
                    <Text
                      style={[styles.dueDateOverdueLabel, { color: colors.overdueText }]}
                    >
                      OVERDUE ·{' '}
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.dueDateText,
                      { color: isOverdue && !isWorking ? colors.overdueText : '#C06070' },
                    ]}
                  >
                    {dueDateDdMm}
                  </Text>
                </View>
              ) : (
                <View />
              )}

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.price, { color: colors.foreground }]}>
                  ₹{order.price.toFixed(0)}
                </Text>
                {outstanding > 0 && (
                  <Text style={[styles.outstanding, { color: accentColor }]}>
                    −₹{outstanding.toFixed(0)}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  // Background revealed on left swipe
  actionBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  actionLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 14,
  },
  thumb: { width: 50, height: 50 },
  iconBox: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  workingDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  middle: { flex: 1, gap: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', flex: 1 },
  productName: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  pillsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  pillGap: { width: 6 },
  workingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  workingLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.5 },
  // Right column — all items right-aligned
  right: {
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 2,
  },
  dueDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dueDateOverdueLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  dueDateText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  price: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  outstanding: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
