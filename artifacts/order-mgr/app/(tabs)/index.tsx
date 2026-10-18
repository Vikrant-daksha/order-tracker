import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo, useState, useRef, useCallback } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OrderCard } from "@/components/OrderCard";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseContext";
import { Order } from "@/types";
import { ChatBubble } from "@/components/ChatBubble";
import TickAnimation from "@/animation/TickAnimation";

function isOverdue(order: Order) {
  if (
    !order.dueDate ||
    order.status === "Delivered" ||
    order.status === "Shipped" ||
    order.status === "Completed"
  )
    return false;
  return order.dueDate < new Date().toISOString().split("T")[0];
}

function getLocalDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getOrderDateOnly(order: Order): string {
  const dStr = order.orderDate || order.createdAt;
  if (!dStr) return "";
  return dStr.slice(0, 10);
}

function matchesToday(order: Order): boolean {
  const dStr = getOrderDateOnly(order);
  if (!dStr) return false;
  const localToday = getLocalDateString();
  const utcToday = new Date().toISOString().split("T")[0];
  return dStr === localToday || dStr === utcToday;
}

function matchesYesterday(order: Order): boolean {
  const dStr = getOrderDateOnly(order);
  if (!dStr) return false;
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const localYest = getLocalDateString(yest);
  const utcYest = yest.toISOString().split("T")[0];
  return dStr === localYest || dStr === utcYest;
}

function getOrderAmount(order: Order): number {
  if (
    typeof order.price === "number" &&
    !isNaN(order.price) &&
    order.price > 0
  ) {
    return order.price;
  }
  if (
    typeof order.amountPaid === "number" &&
    !isNaN(order.amountPaid) &&
    order.amountPaid > 0
  ) {
    return order.amountPaid;
  }
  return 0;
}

function formatRevenue(val: number): string {
  if (val >= 100000)
    return `₹${(val / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(val)}`;
}

function isDueToday(order: Order) {
  if (
    order.status === "Shipped" ||
    order.status === "Delivered" ||
    order.status === "Completed"
  )
    return false;
  const localToday = getLocalDateString();
  const utcToday = new Date().toISOString().split("T")[0];
  const due = (order.dueDate || "").slice(0, 10);
  return due === localToday || due === utcToday;
}

function isDueThisWeek(order: Order) {
  if (
    order.status === "Shipped" ||
    order.status === "Delivered" ||
    order.status === "Completed"
  )
    return false;
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
  const { orders } = useDatabase();
  const [attentionPage, setAttentionPage] = useState(1);
  const [listScrollEnabled, setListScrollEnabled] = useState(true);
  const [dueFilter, setDueFilter] = useState<"withDue" | "noDue">("withDue");

  const active = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== "Delivered" &&
          o.status !== "Shipped" &&
          o.status !== "Completed",
      ),
    [orders],
  );
  const overdue = useMemo(() => active.filter(isOverdue), [active]);
  const dueToday = useMemo(() => active.filter(isDueToday), [active]);
  const dueTomorrow = useMemo(
    () =>
      active.filter((o) => {
        if (
          !o.dueDate ||
          o.status === "Delivered" ||
          o.status === "Shipped" ||
          o.status === "Completed"
        )
          return false;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return o.dueDate === tomorrow.toISOString().split("T")[0];
      }),
    [active],
  );
  const dueThisWeek = useMemo(
    () => active.filter((o) => !isDueToday(o) && isDueThisWeek(o)),
    [active],
  );
  const outstanding = useMemo(
    () => orders.reduce((s, o) => s + Math.max(0, o.price - o.amountPaid), 0),
    [orders],
  );
  const unpaidCount = useMemo(
    () => orders.filter((o) => o.paymentStatus !== "Paid").length,
    [orders],
  );

  const ordersToday = useMemo(() => orders.filter(matchesToday), [orders]);

  const todaysRevenue = useMemo(
    () => ordersToday.reduce((sum, o) => sum + getOrderAmount(o), 0),
    [ordersToday],
  );

  const avgOrderValue = useMemo(() => {
    if (ordersToday.length === 0) return 0;
    return Math.round(todaysRevenue / ordersToday.length);
  }, [ordersToday.length, todaysRevenue]);

  const ordersYesterday = useMemo(
    () => orders.filter(matchesYesterday),
    [orders],
  );

  const yesterdaysRevenue = useMemo(
    () => ordersYesterday.reduce((sum, o) => sum + getOrderAmount(o), 0),
    [ordersYesterday],
  );

  const todayDateSubtitle = useMemo(() => {
    const d = new Date();
    return `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
  }, []);

  const workingOn = useMemo(
    () =>
      orders.filter(
        (o) =>
          !!o.workingOn &&
          o.status !== "Delivered" &&
          o.status !== "Shipped" &&
          o.status !== "Completed",
      ),
    [orders],
  );

  const noDueListSorted = useMemo(() => {
    return active
      .filter((o) => !o.dueDate && !o.workingOn)
      .sort((a, b) => {
        const ad = a.orderDate || "";
        const bd = b.orderDate || "";
        if (ad === bd) {
          return a.id.localeCompare(b.id);
        }
        return ad.localeCompare(bd);
      });
  }, [active]);

  const withDueCount = useMemo(() => {
    const overdueList = overdue.filter((o) => !o.workingOn);
    const todayList = dueToday.filter((o) => !isOverdue(o) && !o.workingOn);
    const tomorrowList = dueTomorrow.filter((o) => !o.workingOn);
    const tomorrowDateStr = (() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split("T")[0];
    })();
    const upcomingList = dueThisWeek.filter(
      (o) =>
        o.dueDate !== new Date().toISOString().split("T")[0] &&
        o.dueDate !== tomorrowDateStr &&
        !o.workingOn,
    );
    return (
      overdueList.length +
      todayList.length +
      tomorrowList.length +
      upcomingList.length
    );
  }, [overdue, dueToday, dueTomorrow, dueThisWeek]);

  type FlatListItem =
    | { type: "header"; id: string; title: string }
    | { type: "order"; id: string; order: Order; isOverdue: boolean };

  const listItems = useMemo(() => {
    const items: FlatListItem[] = [];

    if (dueFilter === "noDue") {
      if (noDueListSorted.length > 0) {
        items.push({
          type: "header",
          id: "h-nodue",
          title: "Orders Without Due Date",
        });
        noDueListSorted.forEach((o) =>
          items.push({ type: "order", id: o.id, order: o, isOverdue: false }),
        );
      }
      return items;
    }

    const overdueList = overdue.filter((o) => !o.workingOn);
    const todayList = dueToday.filter((o) => !isOverdue(o) && !o.workingOn);
    const tomorrowList = dueTomorrow.filter((o) => !o.workingOn);
    // filter out today & tomorrow from this week's upcoming orders
    const tomorrowDateStr = (() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split("T")[0];
    })();
    const upcomingList = dueThisWeek.filter(
      (o) =>
        o.dueDate !== new Date().toISOString().split("T")[0] &&
        o.dueDate !== tomorrowDateStr &&
        !o.workingOn,
    );

    if (overdueList.length > 0) {
      items.push({ type: "header", id: "h-overdue", title: "Overdue" });
      overdueList.forEach((o) =>
        items.push({ type: "order", id: o.id, order: o, isOverdue: true }),
      );
    }
    if (todayList.length > 0) {
      items.push({ type: "header", id: "h-today", title: "Due Today" });
      todayList.forEach((o) =>
        items.push({ type: "order", id: o.id, order: o, isOverdue: false }),
      );
    }
    if (tomorrowList.length > 0) {
      items.push({ type: "header", id: "h-tomorrow", title: "Due Tomorrow" });
      tomorrowList.forEach((o) =>
        items.push({ type: "order", id: o.id, order: o, isOverdue: false }),
      );
    }
    if (upcomingList.length > 0) {
      items.push({
        type: "header",
        id: "h-upcoming",
        title: "Upcoming (This Week)",
      });
      upcomingList.forEach((o) =>
        items.push({ type: "order", id: o.id, order: o, isOverdue: false }),
      );
    }
    return items;
  }, [dueFilter, overdue, dueToday, dueTomorrow, dueThisWeek, noDueListSorted]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
        scrollEnabled={listScrollEnabled}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={styles.subdivHeader}>
                <Text
                  style={[
                    styles.subdivTitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {item.title.toUpperCase()}
                </Text>
              </View>
            );
          }
          return (
            <OrderCard
              order={item.order}
              isOverdue={item.isOverdue}
              onSwipeActive={(active) => setListScrollEnabled(!active)}
            />
          );
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 100,
        }}
        ListHeaderComponent={
          <>
            {/* ── Header ─────────────────────────────────────── */}
            <View style={[styles.header, { paddingTop: topPad + 12 }]}>
              <View style={styles.headerLeft}>
                <Text
                  style={[styles.dateLabel, { color: colors.mutedForeground }]}
                >
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  Dashboard
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Pressable
                  onPress={() => router.push("/kanban" as any)}
                  style={[
                    styles.headerBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather
                    name="columns"
                    size={17}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>

            {/* ── Stats Row ───────────────────────────────────── */}
            <View style={styles.statsRow}>
              <StatCard
                label="Orders Today"
                value={ordersToday.length}
                subtitle={`Avg: ₹${avgOrderValue >= 1000 ? (avgOrderValue / 1000).toFixed(1).replace(/\.0$/, "") + "k / order" : avgOrderValue}`}
                accent={
                  ordersToday.length > 0 ? "#C06070" : colors.mutedForeground
                }
                bg={ordersToday.length > 0 ? colors.card : colors.card}
                icon="shopping-bag"
                colors={colors}
              />
              <StatCard
                label="Orders Due"
                value={dueToday.length}
                subtitle={todayDateSubtitle}
                accent={
                  dueToday.length > 0 ? "#C06070" : colors.mutedForeground
                }
                bg={dueToday.length > 0 ? colors.card : colors.card}
                icon="clock"
                colors={colors}
              />
              <StatCard
                label="Todays Revenue"
                value={formatRevenue(todaysRevenue)}
                subtitle={`Yesterday: ₹${yesterdaysRevenue >= 1000 ? (yesterdaysRevenue / 1000).toFixed(1).replace(/\.0$/, "") + "k" : Math.round(yesterdaysRevenue)}`}
                accent={todaysRevenue > 0 ? "#C06070" : colors.mutedForeground}
                bg={todaysRevenue > 0 ? colors.card : colors.card}
                icon="credit-card"
                IconFamily={FontAwesome}
                colors={colors}
              />
            </View>

            {/* ── Working On ──────────────────────────────────── */}
            <SectionHeader
              icon="tool"
              title="Currently Working On"
              action="All orders"
              onAction={() => router.push("/orders" as any)}
              colors={colors}
            />

            {workingOn.length === 0 ? (
              <View style={styles.idleCenteredContainer}>
                <View style={styles.idleCenteredCard}>
                  <Feather
                    name="coffee"
                    size={42}
                    color="#E8A2B5"
                    style={{ marginBottom: 10 }}
                  />
                  <Text style={styles.idleCenteredTitle}>No active work</Text>
                </View>
              </View>
            ) : (
              <WorkingCardsRow
                orders={workingOn}
                colors={colors}
                router={router}
              />
            )}

            {/* ── Upcoming Due Orders ─────────────────────────────── */}
            <SectionHeader
              icon="alert-circle"
              title="Upcoming Due Orders"
              action="See all"
              onAction={() => router.push("/orders" as any)}
              colors={colors}
              style={{ marginTop: 6 }}
            />

            {/* Filter Tabs for Due vs No Due */}
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                paddingHorizontal: 16,
                marginBottom: 12,
              }}
            >
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDueFilter("withDue");
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor:
                    dueFilter === "withDue" ? "#C06070" : colors.card,
                  borderWidth: 1,
                  borderColor:
                    dueFilter === "withDue" ? "#C06070" : colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                    color:
                      dueFilter === "withDue" ? "#fff" : colors.mutedForeground,
                  }}
                >
                  Due Dates ({withDueCount})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDueFilter("noDue");
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor:
                    dueFilter === "noDue" ? "#C06070" : colors.card,
                  borderWidth: 1,
                  borderColor:
                    dueFilter === "noDue" ? "#C06070" : colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                    color:
                      dueFilter === "noDue" ? "#fff" : colors.mutedForeground,
                  }}
                >
                  No Due Date ({noDueListSorted.length})
                </Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          listItems.length === 0 ? (
            <View style={styles.empty}>
              <View
                style={[
                  styles.emptyIconBox,
                  { backgroundColor: colors.accent },
                ]}
              >
                <Feather name="check-circle" size={28} color="#C06070" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {dueFilter === "noDue" ? "All caught up" : "Nothing urgent"}
              </Text>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                {dueFilter === "noDue"
                  ? "No active orders without due dates at the moment."
                  : "No overdue or upcoming orders — you're on top of things."}
              </Text>
            </View>
          ) : null
        }
      />
      <ChatBubble />
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, action, onAction, colors, style }: any) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionLeft}>
        <Feather name={icon} size={14} color="#C06070" />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {title}
        </Text>
      </View>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={[styles.seeAll, { color: "#C06070" }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

// ── Working Cards Row (scroll container + smart scroll logic) ─────────────────

const CARD_WIDTH = 200;
const CARD_GAP = 12;

function WorkingCardsRow({
  orders,
  colors,
  router,
}: {
  orders: Order[];
  colors: any;
  router: any;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);

  const handleScroll = useCallback((e: any) => {
    scrollX.current = e.nativeEvent.contentOffset.x;
  }, []);

  /**
   * After a card at `index` finishes its collapse, scroll to the nearest
   * surviving neighbor so the user isn't left looking at empty space.
   *
   * "Nearest" logic:
   *   - If there's a card to the LEFT (index > 0) → scroll left
   *   - Otherwise scroll to the card that slid into the removed slot (right)
   *   - If it was the only card, do nothing
   */
  const scrollToNearest = useCallback(
    (removedIndex: number, totalBefore: number) => {
      if (totalBefore <= 1) return; // was the only card
      const targetIndex = removedIndex > 0 ? removedIndex - 1 : 0; // prefer left neighbor
      const targetX = targetIndex * (CARD_WIDTH + CARD_GAP);

      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: targetX, animated: true });
      }, 50);
    },
    [],
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.workingScroll}
      style={{ marginBottom: 8 }}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      {orders.map((order, index) => (
        <AnimatedWorkingCard
          key={order.id}
          order={order}
          index={index}
          totalCards={orders.length}
          colors={colors}
          router={router}
          onCardRemoved={scrollToNearest}
        />
      ))}
    </ScrollView>
  );
}

// ── Working Card (with animation + fade + collapse) ──────────────────────────

const SOURCE_ICONS: Record<string, string> = {
  Instagram: "instagram",
  Facebook: "facebook",
  WhatsApp: "message-circle",
  Website: "globe",
  Email: "mail",
  Manual: "edit-3",
};

function AnimatedWorkingCard({
  order,
  index,
  totalCards,
  colors,
  router,
  onCardRemoved,
}: {
  order: Order;
  index: number;
  totalCards: number;
  colors: any;
  router: any;
  onCardRemoved: (removedIndex: number, totalBefore: number) => void;
}) {
  const { toggleWorkingOn, updateOrder } = useDatabase();
  const overdue = isOverdue(order);
  const outstanding = order.price - order.amountPaid;

  // ── State: is the ship animation playing? ──
  const [isShipping, setIsShipping] = useState(false);

  // ── Animated values for fade-out + width collapse ──
  const cardOpacity = useSharedValue(1);
  const cardWidth = useSharedValue(CARD_WIDTH);
  const cardMargin = useSharedValue(CARD_GAP);

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    width: cardWidth.value,
    marginRight: cardMargin.value,
    overflow: "hidden" as const,
  }));

  // Called when animation is 100% done: card collapses shut like a solid accordion
  const handleFullyDone = useCallback(() => {
    const COLLAPSE_DURATION = 350;

    // Squeeze width and margin shut while staying 100% solid & opaque
    cardWidth.value = withTiming(0, {
      duration: COLLAPSE_DURATION,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
    cardMargin.value = withTiming(0, {
      duration: COLLAPSE_DURATION,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });

    // Only update order in DB once the card has fully squeezed shut to 0px
    setTimeout(() => {
      updateOrder(order.id, { status: "Completed", workingOn: 0 });
      onCardRemoved(index, totalCards);
    }, COLLAPSE_DURATION + 20);
  }, [order.id, index, totalCards]);

  function handleReadyToShip() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsShipping(true);
  }

  function handleStopWorking() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleWorkingOn(order.id);
  }

  return (
    <Animated.View style={wrapperStyle}>
      <Pressable
        style={({ pressed }) => [
          styles.workingCard,
          {
            backgroundColor: colors.card,
            borderColor: isShipping
              ? "#C06070"
              : overdue
                ? "#B71C1C"
                : "#C06070",
            opacity: pressed ? 0.93 : 1,
          },
        ]}
        onPress={() => !isShipping && router.push(`/order/${order.id}` as any)}
      >
        {/* ── Animation overlay ── */}
        {isShipping && (
          <View style={styles.animOverlay}>
            <TickAnimation onFullyDone={handleFullyDone} />
          </View>
        )}

        {/* ── Square Image / Icon Hero ── */}
        <View style={styles.wImageWrap}>
          {order.thumbnailPath ? (
            <Image
              source={{ uri: order.thumbnailPath }}
              style={styles.wImage}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.wImagePlaceholder,
                { backgroundColor: overdue ? "#2D1515" : "#2A1520" },
              ]}
            >
              <Feather
                name={(SOURCE_ICONS[order.source] as any) || "package"}
                size={36}
                color={overdue ? "#FF5555" : "#C06070"}
              />
            </View>
          )}
          {/* Due date badge — top left, only shown if due date exists */}
          {order.dueDate ? (
            <View
              style={[
                styles.wDueBadge,
                { backgroundColor: overdue ? "#B71C1C" : "rgba(0,0,0,0.55)" },
              ]}
            >
              {overdue && <Feather name="alert-circle" size={9} color="#fff" />}
              <Text style={styles.wDueBadgeText}>
                {overdue ? "LATE · " : ""}
                {order.dueDate.slice(8)}-{order.dueDate.slice(5, 7)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Content: name+product LEFT, price RIGHT ── */}
        <View style={styles.wContent}>
          <View style={styles.wNamePriceRow}>
            {/* Left: name + product */}
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={[styles.wName, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {order.customerName || "Unknown"}
              </Text>
              <Text
                style={[styles.wProduct, { color: colors.mutedForeground }]}
                numberOfLines={1}
              >
                {order.customName || "Custom order"}
              </Text>
            </View>
            {/* Right: price + outstanding */}
            <View style={styles.wPriceCol}>
              <Text style={[styles.wPrice, { color: colors.foreground }]}>
                ₹{order.price.toFixed(0)}
              </Text>
              {outstanding > 0 && (
                <Text style={[styles.wOutstanding, { color: "#C06070" }]}>
                  −₹{outstanding.toFixed(0)}
                </Text>
              )}
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.wActions}>
            {/* Stop working */}
            <Pressable
              onPress={handleStopWorking}
              hitSlop={8}
              disabled={isShipping}
              style={[
                styles.wActionBtn,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  flex: 1,
                  opacity: isShipping ? 0.4 : 1,
                },
              ]}
            >
              <Feather name="x" size={12} color={colors.mutedForeground} />
              <Text
                style={[styles.wActionLabel, { color: colors.mutedForeground }]}
              >
                Stop
              </Text>
            </Pressable>

            {/* Ready to ship — primary CTA */}
            <Pressable
              onPress={handleReadyToShip}
              hitSlop={8}
              disabled={isShipping}
              style={[
                styles.wActionBtn,
                styles.wShipBtn,
                { flex: 2, opacity: isShipping ? 0.4 : 1 },
              ]}
            >
              <Feather name="send" size={12} color="#fff" />
              <Text style={styles.wShipLabel}>Ready to Ship</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
  accent,
  bg,
  icon,
  colors,
  IconFamily = Feather,
}: any) {
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: bg, borderColor: colors.border },
      ]}
    >
      <IconFamily name={icon} size={14} color={accent} />
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text
        style={[styles.statLabel, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.statSubtitle, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerLeft: { gap: 2 },
  dateLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
  },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    letterSpacing: 0.2,
    marginTop: 2,
  },
  statSubtitle: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: -2,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },

  // Subdivision headers
  subdivHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  subdivTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },

  // Idle Centered state
  idleCenteredContainer: {
    alignSelf: "stretch",
    height: 272, // Matches ScrollView height (272 card height + 12 vertical padding)
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  idleCenteredCard: {
    alignSelf: "stretch",
    height: 272, // Matches the height of the active WIP card
    backgroundColor: "#F2F2F7", // Lighter gray
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: "#E8A2B5", // Lighter pink
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  idleCenteredTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#E8A2B5", // Lighter pink
  },

  // Working cards
  workingScroll: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 2,
    // gap removed — marginRight is animated per-card for smooth collapse
  },
  workingCard: {
    width: 200,
    height: 272, // Matches the height of the active WIP card
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  // Full-card overlay for the tick animation
  animOverlay: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    zIndex: 10,
    backgroundColor: "transparent",
    borderRadius: 18, // matches workingCard borderRadius
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  // Square image — width 200, height 200
  wImageWrap: { position: "relative", width: "100%", height: 160 },
  wImage: { width: "100%", height: 160 },
  wImagePlaceholder: {
    width: "100%",
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  // Due date badge on image (replaces WIP/LATE badges)
  wDueBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  wDueBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
  // Content area
  wContent: { padding: 12, gap: 8 },
  wNamePriceRow: { flexDirection: "row", alignItems: "flex-start" },
  wName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  wProduct: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  wPriceCol: { alignItems: "flex-end" },
  wPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  wOutstanding: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  // Action buttons
  wActions: { flexDirection: "row", gap: 6, marginTop: 2 },
  wActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  wActionLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  wShipBtn: {
    backgroundColor: "#C06070",
    borderColor: "#C06070",
  },
  wShipLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Load more
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
  },
  loadMoreText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  // Empty state
  empty: {
    alignItems: "center",
    paddingTop: 40,
    gap: 14,
    paddingHorizontal: 40,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 19, fontFamily: "Inter_600SemiBold" },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    color: "#8E8E93",
  },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
    }),
  },
});
