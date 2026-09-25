import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseContext";
import { Expense, ExpenseCategory } from "@/types";
import { AddExpenseModal } from "@/components/AddExpenseModal";
import { DatePickerField } from "@/components/DatePickerField";

// --- Theme Tokens ---
const THEME = {
  bg: "#ffffff",
  cardBg: "#FFFFFF",
  cardBorder: "#F8CCD7",
  cardBorderSubtle: "#FCE4EC",
  textPrimary: "#1C1C1E",
  textSecondary: "#8B5E6D",
  textMuted: "#A38590",
  darkRose: "#C23363",
  deepBerry: "#8B2446",
  accentPink: "#F8BCCD",
  accentPinkLight: "#FFE4EE",
  trackBg: "#F5D0DB",
  dangerBg: "#FFF0F2",
  dangerText: "#D32F2F",
  dangerBorder: "#FFCDD2",
};

type FilterMode = "this_month" | "month_wise" | "date_wise" | "all_time";

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.slice(0, 10).split("-").map(Number);
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  } catch {}
  return dateStr;
}

function formatMonthName(monthStr: string): string {
  try {
    const [y, m] = monthStr.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return monthStr;
  }
}

const CATEGORY_COLORS: Record<
  string,
  { bg: string; text: string; icon: keyof typeof Feather.glyphMap }
> = {
  Supplies: { bg: "#FFF0F4", text: "#C23363", icon: "box" },
  Packaging: { bg: "#F0F4FF", text: "#3B82F6", icon: "package" },
  Shipping: { bg: "#F3E8FF", text: "#8B5CF6", icon: "truck" },
  Marketing: { bg: "#ECFDF5", text: "#10B981", icon: "trending-up" },
  Equipment: { bg: "#FEF3C7", text: "#D97706", icon: "tool" },
  Other: { bg: "#F3F4F6", text: "#6B7280", icon: "tag" },
};

export default function ExpensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { expenses, deleteExpense, addExpense } = useDatabase();

  const [filterMode, setFilterMode] = useState<FilterMode>("this_month");
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    toLocalDateStr(new Date()).slice(0, 7),
  );
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toLocalDateStr(new Date()),
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // List of distinct available months from expenses, plus last 6 months
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(toLocalDateStr(d).slice(0, 7));
    }
    expenses.forEach((e) => {
      const d = e.date?.slice(0, 7);
      if (d && d.length === 7) set.add(d);
    });
    return Array.from(set).sort().reverse();
  }, [expenses]);

  // Filter expenses according to selected filter mode
  const filteredExpenses = useMemo(() => {
    const currentMonthKey = toLocalDateStr(new Date()).slice(0, 7);

    return expenses
      .filter((e) => {
        const eDate = e.date ? e.date.slice(0, 10) : "";
        if (!eDate) return false;

        if (filterMode === "this_month") {
          return eDate.startsWith(currentMonthKey);
        }
        if (filterMode === "month_wise") {
          return eDate.startsWith(selectedMonth);
        }
        if (filterMode === "date_wise") {
          return eDate === selectedDate;
        }
        return true; // all_time
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [expenses, filterMode, selectedMonth, selectedDate]);

  // Total filtered expense amount
  const totalFilteredAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [filteredExpenses]);

  // Active filter label description
  const filterLabel = useMemo(() => {
    if (filterMode === "this_month") {
      return formatMonthName(toLocalDateStr(new Date()).slice(0, 7));
    }
    if (filterMode === "month_wise") {
      return formatMonthName(selectedMonth);
    }
    if (filterMode === "date_wise") {
      return formatDisplayDate(selectedDate);
    }
    return "All Time";
  }, [filterMode, selectedMonth, selectedDate]);

  const handleDeleteExpense = (expense: Expense) => {
    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete ₹${expense.amount.toFixed(2)} (${expense.category || "Expense"}) recorded on ${formatDisplayDate(expense.date)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExpense(expense.id);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
            } catch (err) {
              Alert.alert("Error", "Could not delete this expense.");
            }
          },
        },
      ],
    );
  };

  const handleSaveExpense = async (data: Omit<Expense, "id" | "createdAt">) => {
    try {
      await addExpense(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setShowAddModal(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: THEME.bg }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={22} color={THEME.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Expenses</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowAddModal(true)}
          style={styles.addBtn}
        >
          <Feather name="plus" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
        }}
      >
        {/* Total Expenses Card */}
        <View style={styles.totalCard}>
          <View style={styles.totalCardHeader}>
            <View style={styles.totalIconWrap}>
              <FontAwesome name="rupee" size={18} color={THEME.darkRose} />
            </View>
            <View style={styles.totalBadge}>
              <Feather name="calendar" size={12} color={THEME.darkRose} />
              <Text style={styles.totalBadgeText}>{filterLabel}</Text>
            </View>
          </View>
          <Text style={styles.totalSubLabel}>Total Expenses</Text>
          <Text style={styles.totalAmount}>
            ₹
            {totalFilteredAmount.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <Text style={styles.totalCount}>
            {filteredExpenses.length}{" "}
            {filteredExpenses.length === 1 ? "expense" : "expenses"} recorded
          </Text>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>FILTER BY</Text>
          <View style={styles.filterPillsRow}>
            <Pressable
              onPress={() => setFilterMode("this_month")}
              style={[
                styles.filterPill,
                filterMode === "this_month" && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filterMode === "this_month" && styles.filterPillTextActive,
                ]}
              >
                This Month
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode("month_wise")}
              style={[
                styles.filterPill,
                filterMode === "month_wise" && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filterMode === "month_wise" && styles.filterPillTextActive,
                ]}
              >
                Month
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode("date_wise")}
              style={[
                styles.filterPill,
                filterMode === "date_wise" && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filterMode === "date_wise" && styles.filterPillTextActive,
                ]}
              >
                Date
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode("all_time")}
              style={[
                styles.filterPill,
                filterMode === "all_time" && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filterMode === "all_time" && styles.filterPillTextActive,
                ]}
              >
                All Time
              </Text>
            </Pressable>
          </View>

          {/* Month Selector for month_wise */}
          {filterMode === "month_wise" && (
            <View style={styles.subFilterWrap}>
              <Text style={styles.subFilterLabel}>Select Month:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.monthScrollContent}
              >
                {availableMonths.map((mStr) => {
                  const isSel = selectedMonth === mStr;
                  return (
                    <TouchableOpacity
                      key={mStr}
                      onPress={() => setSelectedMonth(mStr)}
                      style={[
                        styles.monthChip,
                        isSel && styles.monthChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.monthChipText,
                          isSel && styles.monthChipTextActive,
                        ]}
                      >
                        {formatMonthName(mStr)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Date Picker for date_wise */}
          {filterMode === "date_wise" && (
            <View style={styles.subFilterWrap}>
              <Text style={styles.subFilterLabel}>Select Date:</Text>
              <DatePickerField
                label=""
                value={selectedDate}
                onChange={setSelectedDate}
              />
            </View>
          )}
        </View>

        {/* Expenses List Section */}
        <View style={styles.listSection}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listSectionTitle}>Expense Records</Text>
            <Text style={styles.listSectionCount}>
              {filteredExpenses.length} items
            </Text>
          </View>

          {filteredExpenses.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Feather name="file-text" size={24} color={THEME.darkRose} />
              </View>
              <Text style={styles.emptyTitle}>No expenses found</Text>
              <Text style={styles.emptyDesc}>
                There are no expenses recorded for {filterLabel}.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowAddModal(true)}
                style={styles.emptyAddBtn}
              >
                <Feather name="plus" size={15} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Add Expense</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.expenseItemsList}>
              {filteredExpenses.map((item) => {
                const catStyle =
                  CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;
                return (
                  <View key={item.id} style={styles.expenseCard}>
                    <View style={styles.expenseLeft}>
                      <View
                        style={[
                          styles.categoryIconBadge,
                          { backgroundColor: catStyle.bg },
                        ]}
                      >
                        <Feather
                          name={catStyle.icon}
                          size={18}
                          color={catStyle.text}
                        />
                      </View>
                      <View style={styles.expenseInfo}>
                        <View style={styles.expenseCategoryRow}>
                          <Text style={styles.expenseCategoryName}>
                            {item.category || "Expense"}
                          </Text>
                          <Text style={styles.expenseDate}>
                            {formatDisplayDate(item.date)}
                          </Text>
                        </View>
                        {!!item.note && (
                          <Text style={styles.expenseNote} numberOfLines={2}>
                            {item.note}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.expenseRight}>
                      <Text style={styles.expenseAmount}>
                        ₹{item.amount.toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleDeleteExpense(item)}
                        style={styles.deleteBtn}
                        hitSlop={8}
                      >
                        <Feather
                          name="trash-2"
                          size={15}
                          color={THEME.dangerText}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Expense Modal */}
      <AddExpenseModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveExpense}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.cardBorderSubtle,
    backgroundColor: THEME.bg,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.textPrimary,
    letterSpacing: -0.3,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.darkRose,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: THEME.darkRose,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  totalCard: {
    margin: 16,
    marginBottom: 8,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#FFF5F8",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    shadowColor: "#D94876",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  totalCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  totalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.accentPinkLight,
    alignItems: "center",
    justifyContent: "center",
  },
  totalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  totalBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.darkRose,
  },
  totalSubLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSecondary,
    marginBottom: 2,
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: THEME.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    letterSpacing: -0.5,
  },
  totalCount: {
    fontSize: 11,
    fontWeight: "500",
    color: THEME.textMuted,
    marginTop: 4,
  },
  filterSection: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  filterTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  filterPillsRow: {
    flexDirection: "row",
    backgroundColor: "#F9ECEF",
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  filterPillActive: {
    backgroundColor: THEME.darkRose,
    shadowColor: THEME.darkRose,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  subFilterWrap: {
    marginTop: 10,
  },
  subFilterLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textSecondary,
    marginBottom: 6,
  },
  monthScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  monthChipActive: {
    backgroundColor: THEME.accentPinkLight,
    borderColor: THEME.darkRose,
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  monthChipTextActive: {
    color: THEME.darkRose,
    fontWeight: "700",
  },
  listSection: {
    marginHorizontal: 16,
    marginTop: 14,
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  listSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  listSectionCount: {
    fontSize: 12,
    fontWeight: "500",
    color: THEME.textMuted,
  },
  expenseItemsList: {
    gap: 10,
  },
  expenseCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: THEME.cardBg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    shadowColor: "#D94876",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  expenseLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  categoryIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  expenseInfo: {
    flex: 1,
  },
  expenseCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  expenseCategoryName: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  expenseDate: {
    fontSize: 11,
    color: THEME.textMuted,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  expenseNote: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  expenseRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: THEME.textPrimary,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  deleteBtn: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: THEME.dangerBg,
    borderWidth: 1,
    borderColor: THEME.dangerBorder,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.cardBorder,
    marginTop: 8,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: THEME.accentPinkLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: THEME.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 17,
    maxWidth: 240,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: THEME.darkRose,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 14,
  },
  emptyAddBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
