import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseContext";
import { Order } from "@/types";
import { StatusPill } from "./StatusPill";

interface OrderCardProps {
  order: Order;
  isOverdue?: boolean;
  /** Optional: parent can pass a setter to disable its scroll while swiping */
  onSwipeActive?: (active: boolean) => void;
}

const SOURCE_ICONS: Record<string, string> = {
  Instagram: "instagram",
  Facebook: "facebook",
  WhatsApp: "message-circle",
  Website: "globe",
  Email: "mail",
  Manual: "edit-3",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDueDate(iso?: string | null): string {
  if (!iso) return "";
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = match[1];
    const monthIdx = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const month = MONTHS[monthIdx] || "";
    return `${day} ${month} ${year}`;
  }
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  return iso;
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
  const isClosed =
    order.status === "Completed" ||
    order.status === "Shipped" ||
    order.status === "Delivered";
  const canSwipeWip = isWorking || !isClosed;

  // ─── Reanimated shared values (live on native UI thread) ──────────────
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);

  const accentColor = isWorking
    ? "#C06070"
    : isOverdue
      ? "#B71C1C"
      : colors.mutedForeground;
  const cardBorderColor = isWorking
    ? "#C06070"
    : isOverdue
      ? "#FFB3BA"
      : colors.border;
  const dueDateFormatted = order.dueDate ? formatDueDate(order.dueDate) : null;

  const totalItems =
    order.items && order.items.length > 0
      ? order.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
      : null;

  const itemsSubtitle =
    totalItems !== null
      ? `${totalItems} ${totalItems === 1 ? "item" : "items"}${order.customName ? ` · ${order.customName}` : ""}`
      : order.customName || "1 item";

  const paymentStatusLower = (order.paymentStatus || "").toLowerCase();
  const paymentStatusText: "Paid" | "Partial" | "Unpaid" =
    paymentStatusLower === "paid" || (!order.paymentStatus && outstanding <= 0)
      ? "Paid"
      : paymentStatusLower === "partial" ||
          (!order.paymentStatus && order.amountPaid > 0)
        ? "Partial"
        : "Unpaid";

  const paymentBadgeConfig: Record<string, { bg: string; text: string }> = {
    Paid: { bg: "#E6F4EA", text: "#137333" },
    Partial: { bg: "#FEF3C7", text: "#B45309" },
    Unpaid: { bg: "#FEE2E2", text: "#DC2626" },
  };

  const paymentBadge =
    paymentBadgeConfig[paymentStatusText] || paymentBadgeConfig.Paid;

  // JS-thread callbacks (haptics & state changes can't run on UI thread)
  const handleToggle = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toggleWorkingOn(order.id);
  }, [order.id, toggleWorkingOn]);

  const fireHapticTick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const setSwipeActive = useCallback(
    (active: boolean) => {
      onSwipeActive?.(active);
    },
    [onSwipeActive],
  );

  // ─── Gesture.Pan() — memoized to prevent re-creation during drag ────────
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .enabled(canSwipeWip)
      .activeOffsetX(-8)
      .failOffsetY([-12, 12])
      .onStart(() => {
        "worklet";
        contextX.value = translateX.value;
        hasTriggeredHaptic.value = false;
        if (onSwipeActive) {
          runOnJS(setSwipeActive)(true);
        }
      })
      .onUpdate((event) => {
        "worklet";
        // Directly map finger displacement from drag start
        let newX = contextX.value + event.translationX;

        // Clamp: do not allow dragging right past 0
        if (newX > 0) newX = 0;

        // Rubber-band resistance past max slide
        if (newX < -MAX_SLIDE) {
          const excess = newX + MAX_SLIDE;
          newX = -MAX_SLIDE + excess * 0.2;
        }

        translateX.value = newX;

        // Haptic feedback once when crossing the threshold
        if (newX <= -SWIPE_THRESHOLD) {
          if (!hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = true;
            runOnJS(fireHapticTick)();
          }
        } else {
          hasTriggeredHaptic.value = false;
        }
      })
      .onEnd((event) => {
        "worklet";
        const passedThreshold =
          hasTriggeredHaptic.value || event.translationX <= -SWIPE_THRESHOLD;

        if (passedThreshold) {
          runOnJS(handleToggle)();
        }

        // Return to 0 with overshootClamping to prevent back-and-forth oscillation
        translateX.value = withSpring(0, {
          damping: 24,
          stiffness: 220,
          mass: 0.8,
          overshootClamping: true,
        });
      })
      .onFinalize(() => {
        "worklet";
        // Always cleanly restore to 0 without bounce
        translateX.value = withSpring(0, {
          damping: 24,
          stiffness: 220,
          mass: 0.8,
          overshootClamping: true,
        });
        hasTriggeredHaptic.value = false;
        if (onSwipeActive) {
          runOnJS(setSwipeActive)(false);
        }
      });
  }, [
    canSwipeWip,
    contextX,
    translateX,
    hasTriggeredHaptic,
    handleToggle,
    fireHapticTick,
    setSwipeActive,
    onSwipeActive,
  ]);

  // ─── Animated styles (UI-thread bound, no bridge hops) ────────────────
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionContentStyle = useAnimatedStyle(() => {
    // Only fade and scale once the opening is wide enough (past -28px)
    // This prevents dark antialiasing halos on semi-transparent backgrounds
    // and stops the card border from cutting across the text at 0-40% drag.
    const opacity = interpolate(
      translateX.value,
      [-70, -28],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      translateX.value,
      [-70, -28],
      [1, 0.7],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <View style={[styles.wrapper, { marginHorizontal: 16, marginVertical: 5 }]}>
      {/* ── Background action — revealed on left swipe (only if eligible) ── */}
      {canSwipeWip && (
        <View style={styles.actionBg}>
          <Animated.View style={[styles.actionContent, actionContentStyle]}>
            <Feather
              name={isWorking ? "x-circle" : "tool"}
              size={22}
              color="#8B4D5C"
            />
            <Text style={[styles.actionLabel, { color: "#8B4D5C" }]}>
              {isWorking ? "Remove WIP" : "Mark WIP"}
            </Text>
          </Animated.View>
        </View>
      )}

      {/* ── Sliding card — drags left ── */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: cardBorderColor,
              borderWidth: isWorking || isOverdue ? 1.5 : 1,
            },
            cardAnimatedStyle,
          ]}
        >
          <Pressable
            style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
            onPress={() => router.push(`/order/${order.id}` as any)}
          >
            <View style={styles.inner}>
              {/* Left: thumbnail or icon */}
              <View style={styles.thumbWrapper}>
                {order.thumbnailPath ? (
                  <Image
                    source={{ uri: order.thumbnailPath }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor: isWorking ? "#FDEEF0" : colors.accent,
                      },
                    ]}
                  >
                    <Feather
                      name={(SOURCE_ICONS[order.source] as any) || "package"}
                      size={22}
                      color="#C06070"
                    />
                  </View>
                )}
                {isWorking && (
                  <View
                    style={[
                      styles.workingDot,
                      { backgroundColor: "#C06070", borderColor: colors.card },
                    ]}
                  >
                    <Feather name="tool" size={10} color="#fff" />
                  </View>
                )}
              </View>

              {/* Middle: name + product + status & due date */}
              <View style={styles.middle}>
                <View style={styles.nameRow}>
                  <Text
                    style={[styles.customerName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {order.customerName || "Unknown"}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.productName,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {itemsSubtitle}
                </Text>

                <View style={styles.statusDateRow}>
                  <StatusPill status={order.status} size="sm" showIcon={true} />
                  {dueDateFormatted ? (
                    <View style={styles.dateRow}>
                      <Text
                        style={[styles.dot, { color: colors.mutedForeground }]}
                      >
                        •
                      </Text>
                      <Feather
                        name="calendar"
                        size={11}
                        color={
                          isOverdue && !isWorking
                            ? "#B71C1C"
                            : colors.mutedForeground
                        }
                        style={styles.calendarIcon}
                      />
                      <Text
                        style={[
                          styles.dueDateText,
                          {
                            color:
                              isOverdue && !isWorking
                                ? "#B71C1C"
                                : colors.mutedForeground,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {dueDateFormatted}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Right: price (+4px larger) + payment status aligned to right */}
              <View style={styles.right}>
                {paymentStatusText === "Partial" && outstanding > 0 && (
                  <Text
                    style={[
                      styles.outstandingText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Due ₹{outstanding.toFixed(0)}
                  </Text>
                )}
                <Text style={[styles.price, { color: colors.foreground }]}>
                  ₹{order.price.toFixed(0)}
                </Text>
                <View
                  style={[
                    styles.paymentBadge,
                    { backgroundColor: paymentBadge.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentStatusText,
                      { color: paymentBadge.text },
                    ]}
                  >
                    {paymentStatusText}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
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
    backgroundColor: "#FFE4EE",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 20,
  },
  actionContent: {
    alignItems: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 8,
  },
  thumbWrapper: {
    position: "relative",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  workingDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  middle: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  customerName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  productName: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  statusDateRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    flexWrap: "wrap",
    rowGap: 2,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    fontSize: 16,
    marginHorizontal: 6,
  },
  calendarIcon: {
    marginTop: 1,
    marginRight: 4,
  },
  dueDateText: {
    marginTop: 1,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  workingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  workingLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  // Right column — all items right-aligned and centered vertically
  right: {
    alignSelf: "center",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingLeft: 6,
    paddingRight: 4,
  },
  price: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  paymentBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  paymentStatusText: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  outstandingText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
    marginTop: 1,
  },
});
