import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusPill } from "@/components/StatusPill";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseContext";
import { Order, OrderStatus } from "@/types";

const COLUMNS: OrderStatus[] = [
  "Confirmed",
  "Completed",
  "Shipped",
  "Delivered",
];

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

export default function KanbanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders, updateOrder } = useDatabase();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [filter, setFilter] = useState<"today" | "all">("today");

  const todayCount = useMemo(
    () => orders.filter(matchesToday).length,
    [orders],
  );

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter(matchesToday);
  }, [orders, filter]);

  const grouped = useMemo(() => {
    const map: Record<OrderStatus, Order[]> = {
      Confirmed: [],
      Completed: [],
      Shipped: [],
      Delivered: [],
    };
    for (const o of filteredOrders) {
      if (map[o.status]) map[o.status].push(o);
    }
    return map;
  }, [filteredOrders]);

  async function advanceStatus(order: Order) {
    const next: Record<string, OrderStatus> = {
      Confirmed: "Completed",
      Completed: "Shipped",
      Shipped: "Delivered",
    };
    const nextStatus = next[order.status];
    if (!nextStatus) return;
    await updateOrder(order.id, { status: nextStatus });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const colColors = {
    Confirmed: colors.confirmed,
    Completed: colors.completed,
    Shipped: colors.shipped,
    Delivered: colors.delivered,
  };
  const colTextColors = {
    Confirmed: colors.confirmedText,
    Completed: colors.completedText,
    Shipped: colors.shippedText,
    Delivered: colors.deliveredText,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 8, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Kanban Board
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {filter === "today" ? "Today's Orders" : "All Orders"}
            </Text>
          </View>
          <View style={{ width: 22 }} />
        </View>

        {/* Filter Toggle: Today / All */}
        <View
          style={[
            styles.filterContainer,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Pressable
            onPress={() => {
              setFilter("today");
              Haptics.selectionAsync();
            }}
            style={[
              styles.filterTab,
              filter === "today" && [
                styles.filterTabActive,
                { backgroundColor: colors.card },
              ],
            ]}
          >
            <Text
              style={[
                styles.filterTabText,
                {
                  color:
                    filter === "today"
                      ? colors.foreground
                      : colors.mutedForeground,
                },
                filter === "today" && styles.filterTabTextActive,
              ]}
            >
              Today ({todayCount})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setFilter("all");
              Haptics.selectionAsync();
            }}
            style={[
              styles.filterTab,
              filter === "all" && [
                styles.filterTabActive,
                { backgroundColor: colors.card },
              ],
            ]}
          >
            <Text
              style={[
                styles.filterTabText,
                {
                  color:
                    filter === "all"
                      ? colors.foreground
                      : colors.mutedForeground,
                },
                filter === "all" && styles.filterTabTextActive,
              ]}
            >
              All ({orders.length})
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {COLUMNS.map((col) => (
          <View key={col} style={[styles.column, { width: 280 }]}>
            <View
              style={[styles.colHeader, { backgroundColor: colColors[col] }]}
            >
              <Text style={[styles.colTitle, { color: colTextColors[col] }]}>
                {col}
              </Text>
              <View
                style={[
                  styles.colBadge,
                  { backgroundColor: colTextColors[col] },
                ]}
              >
                <Text style={[styles.colCount, { color: colColors[col] }]}>
                  {grouped[col].length}
                </Text>
              </View>
            </View>

            <FlatList
              data={grouped[col]}
              keyExtractor={(o) => o.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                padding: 10,
                gap: 10,
                paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 20,
              }}
              scrollEnabled={!!grouped[col].length}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push(`/order/${item.id}` as any)}
                  style={({ pressed }) => [
                    styles.kanbanCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: isOverdue(item) ? "#FFB3BA" : colors.border,
                      borderWidth: isOverdue(item) ? 1.5 : 1,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text
                      style={[
                        styles.cardCustomer,
                        { color: colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {item.customerName}
                    </Text>
                    {isOverdue(item) && (
                      <View
                        style={[
                          styles.overdueDot,
                          { backgroundColor: colors.overdueText },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.cardProduct,
                      { color: colors.mutedForeground },
                    ]}
                    numberOfLines={1}
                  >
                    {item.customName || "Custom order"}
                  </Text>
                  <View style={styles.cardBottom}>
                    <Text
                      style={[styles.cardPrice, { color: colors.foreground }]}
                    >
                      ₹{item.price.toFixed(2)}
                    </Text>
                    {item.dueDate && (
                      <Text
                        style={[
                          styles.cardDate,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Due {item.dueDate.slice(5)}
                      </Text>
                    )}
                  </View>
                  {col !== "Delivered" && (
                    <Pressable
                      onPress={() => advanceStatus(item)}
                      style={[
                        styles.advanceBtn,
                        { backgroundColor: colColors[col] },
                      ]}
                    >
                      <Text
                        style={[
                          styles.advanceBtnText,
                          { color: colTextColors[col] },
                        ]}
                      >
                        {col === "Confirmed"
                          ? "Mark Completed"
                          : col === "Completed"
                            ? "Mark Shipped"
                            : "Mark Delivered"}
                      </Text>
                      <Feather
                        name="arrow-right"
                        size={12}
                        color={colTextColors[col]}
                      />
                    </Pressable>
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyCol}>
                  <Text
                    style={[
                      styles.emptyColText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {filter === "today" ? "No orders today" : "No orders"}
                  </Text>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 },
  filterContainer: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
  },
  filterTabActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  filterTabTextActive: {
    fontFamily: "Inter_600SemiBold",
  },
  column: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#E5E5EA",
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  colTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  colBadge: {
    borderRadius: 100,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  colCount: { fontSize: 12, fontFamily: "Inter_700Bold" },
  kanbanCard: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardCustomer: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  overdueDot: { width: 8, height: 8, borderRadius: 4 },
  cardProduct: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardPrice: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  advanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    paddingVertical: 8,
  },
  advanceBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyCol: { padding: 20, alignItems: "center" },
  emptyColText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
