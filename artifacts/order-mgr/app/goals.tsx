import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDatabase } from "@/context/DatabaseContext";
import { GoalStatus, MonthlyGoal } from "@/types";
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
  positiveText: "#1A7A45",
  positiveBg: "#E8F8F0",
  positiveBorder: "#B8F0D0",
  missedText: "#C23363",
  missedBg: "#FFE4EE",
  missedBorder: "#F8CCD7",
};

function formatMonthTitle(monthStr: string) {
  try {
    const [y, m] = monthStr.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleString("en-US", { month: "long", year: "numeric" });
  } catch {
    return monthStr;
  }
}

function formatDateRange(startDate: string, endDate: string) {
  try {
    const [sY, sM, sD] = startDate.split("-").map(Number);
    const [eY, eM, eD] = endDate.split("-").map(Number);
    const sObj = new Date(sY, sM - 1, sD);
    const eObj = new Date(eY, eM - 1, eD);
    const sMonth = sObj.toLocaleString("en-US", { month: "short" });
    const eMonth = eObj.toLocaleString("en-US", { month: "short" });
    return `${sD} ${sMonth} – ${eD} ${eMonth} ${eY}`;
  } catch {
    return `${startDate} – ${endDate}`;
  }
}

function getDefaultDates(monthStr: string) {
  const [yStr, mStr] = monthStr.split("-");
  const y = parseInt(yStr, 10) || new Date().getFullYear();
  const m = parseInt(mStr, 10) || (new Date().getMonth() + 1);
  const lastDay = new Date(y, m, 0).getDate();
  const start = `${monthStr}-01`;
  const end = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function GoalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orders, goals, addMonthlyGoal, updateMonthlyGoal, deleteMonthlyGoal } = useDatabase();

  const [activeFilter, setActiveFilter] = useState<"All" | "in_progress" | "achieved" | "missed">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  // Form State
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [title, setTitle] = useState("Monthly Revenue Target");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [targetAmount, setTargetAmount] = useState("35000");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const startCreateGoal = () => {
    const defaults = getDefaultDates(currentMonthKey);
    setTitle("Monthly Revenue Target");
    setSelectedMonth(currentMonthKey);
    setTargetAmount("35000");
    setStartDate(defaults.start);
    setEndDate(defaults.end);
    setEditingGoalId(null);
    setIsFormOpen(true);
  };

  const startEditGoal = (goal: MonthlyGoal) => {
    setTitle(goal.title || "Monthly Goal");
    setSelectedMonth(goal.month);
    setTargetAmount(String(goal.targetAmount));
    setStartDate(goal.startDate);
    setEndDate(goal.endDate);
    setEditingGoalId(goal.id);
    setIsFormOpen(true);
  };

  const handleSaveGoal = async () => {
    const amt = parseFloat(targetAmount);
    if (!amt || amt <= 0) return;

    if (editingGoalId) {
      await updateMonthlyGoal(editingGoalId, {
        title: title.trim() || "Monthly Goal",
        month: selectedMonth,
        targetAmount: amt,
        startDate,
        endDate,
      });
    } else {
      await addMonthlyGoal({
        title: title.trim() || "Monthly Goal",
        month: selectedMonth,
        targetAmount: amt,
        startDate,
        endDate,
      });
    }
    setIsFormOpen(false);
    setEditingGoalId(null);
  };

  const handleDeleteGoal = (goal: MonthlyGoal) => {
    const confirmMsg = `Delete goal "${goal.title || formatMonthTitle(goal.month)}"?`;
    if (Platform.OS === "web") {
      if (window.confirm(confirmMsg)) {
        deleteMonthlyGoal(goal.id);
      }
    } else {
      Alert.alert(
        "Delete Goal",
        confirmMsg,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteMonthlyGoal(goal.id) },
        ]
      );
    }
  };

  const getGoalStats = (g: MonthlyGoal) => {
    const liveEarned = orders
      .filter((o) => {
        const d = (o.orderDate || o.createdAt || "").slice(0, 10);
        return d >= g.startDate && d <= g.endDate;
      })
      .reduce((sum, o) => sum + (o.amountPaid || 0), 0);

    const earned = g.status === "in_progress" ? liveEarned : (g.earnedAmount || liveEarned);
    const percent = g.targetAmount > 0 ? Math.min(100, Math.round((earned / g.targetAmount) * 100)) : 0;
    const remaining = Math.max(0, g.targetAmount - earned);
    return { earned, percent, remaining };
  };

  // Group and filter goals
  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      // Status filter
      if (activeFilter !== "All" && g.status !== activeFilter) return false;
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesMonth = formatMonthTitle(g.month).toLowerCase().includes(query) || g.month.includes(query);
        const matchesTitle = (g.title || "").toLowerCase().includes(query);
        if (!matchesMonth && !matchesTitle) return false;
      }
      return true;
    });
  }, [goals, activeFilter, searchQuery]);

  // Summary counts
  const totalCount = goals.length;
  const achievedCount = goals.filter((g) => g.status === "achieved").length;
  const missedCount = goals.filter((g) => g.status === "missed").length;
  const inProgressCount = goals.filter((g) => g.status === "in_progress").length;

  return (
    <View style={[styles.container, { backgroundColor: THEME.bg }]}>
      {/* Page Header */}
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 16 : insets.top + 8 },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={20} color={THEME.darkRose} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Monthly Goals</Text>
            <Text style={styles.headerSubtitle}>
              Target tracking & historical records
            </Text>
          </View>
        </View>

        {!isFormOpen && (
          <TouchableOpacity
            onPress={startCreateGoal}
            activeOpacity={0.8}
            style={styles.headerAddBtn}
          >
            <Feather name="plus" size={15} color="#FFFFFF" />
            <Text style={styles.headerAddBtnText}>Add Goal</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isFormOpen ? (
          /* --- Add / Edit Goal Form Card --- */
          <View style={styles.formCard}>
            <View style={styles.formCardHeader}>
              <View style={styles.formHeaderTitleGroup}>
                <View style={styles.badgeIcon}>
                  <Feather name="flag" size={16} color={THEME.darkRose} />
                </View>
                <Text style={styles.formTitle}>
                  {editingGoalId ? "Edit Goal" : "Create New Goal"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsFormOpen(false)}
                style={styles.formCloseBtn}
              >
                <Feather name="x" size={18} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Goal Title / Name */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Goal Name / Description</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Early Month Push, Diwali Sprint"
                placeholderTextColor={THEME.textMuted}
                returnKeyType="done"
              />
            </View>

            {/* Target Amount */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Revenue Target (₹)</Text>
              <View style={styles.amtRow}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  style={styles.amtInput}
                  value={targetAmount}
                  onChangeText={setTargetAmount}
                  keyboardType="decimal-pad"
                  placeholder="35000"
                  placeholderTextColor={THEME.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  autoFocus
                />
              </View>
            </View>

            {/* Quick Presets */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Quick Presets</Text>
              <View style={styles.presetWrap}>
                {[15000, 25000, 35000, 50000, 75000, 100000].map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setTargetAmount(String(p))}
                    style={[
                      styles.presetChip,
                      parseFloat(targetAmount) === p && styles.presetChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        parseFloat(targetAmount) === p && styles.presetTextActive,
                      ]}
                    >
                      ₹{(p / 1000).toFixed(0)}k
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Date Range Selectors */}
            <View style={styles.rowFields}>
              <View style={[styles.field, { flex: 1 }]}>
                <DatePickerField
                  label="Start Date"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder={startDate}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={[styles.field, { flex: 1 }]}>
                <DatePickerField
                  label="End Date"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder={endDate}
                />
              </View>
            </View>

            {/* Form Buttons */}
            <View style={styles.formBtnRow}>
              <TouchableOpacity
                onPress={() => setIsFormOpen(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveGoal}
                disabled={!parseFloat(targetAmount)}
                activeOpacity={0.85}
                style={[
                  styles.saveBtn,
                  !parseFloat(targetAmount) && styles.saveBtnDisabled,
                ]}
              >
                <Feather name="check" size={16} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>
                  {editingGoalId ? "Update Goal" : "Save Goal"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* KPI Summary Strip */}
            <View style={styles.summaryBar}>
              <View style={styles.summaryStatItem}>
                <Text style={styles.summaryStatValue}>{totalCount}</Text>
                <Text style={styles.summaryStatLabel}>Total Goals</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStatItem}>
                <Text
                  style={[styles.summaryStatValue, { color: THEME.positiveText }]}
                >
                  {achievedCount}
                </Text>
                <Text style={styles.summaryStatLabel}>Achieved</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStatItem}>
                <Text
                  style={[styles.summaryStatValue, { color: THEME.missedText }]}
                >
                  {missedCount}
                </Text>
                <Text style={styles.summaryStatLabel}>Missed</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStatItem}>
                <Text
                  style={[styles.summaryStatValue, { color: THEME.deepBerry }]}
                >
                  {inProgressCount}
                </Text>
                <Text style={styles.summaryStatLabel}>Active</Text>
              </View>
            </View>

            {/* Search Input */}
            <View style={styles.searchRow}>
              <Feather name="search" size={16} color={THEME.textSecondary} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search goals by month or name..."
                placeholderTextColor={THEME.textMuted}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Feather name="x" size={16} color={THEME.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterChipsRow}>
              {(["All", "in_progress", "achieved", "missed"] as const).map(
                (filter) => {
                  const label =
                    filter === "All"
                      ? "All Goals"
                      : filter === "in_progress"
                      ? "In Progress"
                      : filter === "achieved"
                      ? "Achieved"
                      : "Missed";
                  const isSelected = activeFilter === filter;
                  return (
                    <TouchableOpacity
                      key={filter}
                      onPress={() => setActiveFilter(filter)}
                      activeOpacity={0.8}
                      style={[
                        styles.filterChip,
                        isSelected && styles.filterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          isSelected && styles.filterChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>

            {/* Goals List */}
            {filteredGoals.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconWrap}>
                  <Feather name="target" size={32} color={THEME.darkRose} />
                </View>
                <Text style={styles.emptyTitle}>No Goals Found</Text>
                <Text style={styles.emptyDesc}>
                  {searchQuery
                    ? `No goals matched "${searchQuery}". Try searching for another month or title.`
                    : "Create multiple goals for any month or specific sales sprint to track your targets."}
                </Text>
                <TouchableOpacity
                  onPress={startCreateGoal}
                  style={styles.emptyAddBtn}
                >
                  <Feather name="plus" size={15} color="#FFFFFF" />
                  <Text style={styles.emptyAddBtnText}>Add Goal</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.goalList}>
                {filteredGoals.map((goal) => {
                  const { earned, percent, remaining } = getGoalStats(goal);
                  const isAchieved = goal.status === "achieved";
                  const isMissed = goal.status === "missed";
                  const isInProgress = goal.status === "in_progress";

                  return (
                    <View key={goal.id} style={styles.goalCard}>
                      {/* Top Header Row of Card */}
                      <View style={styles.goalCardHeader}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.goalCardTitle}>
                            {goal.title || "Monthly Goal"}
                          </Text>
                          <Text style={styles.goalCardMonth}>
                            {formatMonthTitle(goal.month)} •{" "}
                            <Text style={styles.goalDateSub}>
                              {formatDateRange(goal.startDate, goal.endDate)}
                            </Text>
                          </Text>
                        </View>

                        {/* Status Badge */}
                        <View
                          style={[
                            styles.statusBadge,
                            isAchieved && styles.statusBadgeAchieved,
                            isMissed && styles.statusBadgeMissed,
                            isInProgress && styles.statusBadgeInProgress,
                          ]}
                        >
                          <Feather
                            name={
                              isAchieved
                                ? "check-circle"
                                : isMissed
                                ? "alert-circle"
                                : "clock"
                            }
                            size={12}
                            color={
                              isAchieved
                                ? THEME.positiveText
                                : isMissed
                                ? THEME.missedText
                                : THEME.deepBerry
                            }
                          />
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isAchieved && styles.statusTextAchieved,
                              isMissed && styles.statusTextMissed,
                              isInProgress && styles.statusTextInProgress,
                            ]}
                          >
                            {isAchieved
                              ? "Achieved"
                              : isMissed
                              ? "Missed"
                              : "In Progress"}
                          </Text>
                        </View>
                      </View>

                      {/* Amounts Breakdown */}
                      <View style={styles.goalCardAmounts}>
                        <View>
                          <Text style={styles.amountLabel}>Target</Text>
                          <Text style={styles.amountTargetVal}>
                            ₹{goal.targetAmount.toLocaleString("en-IN")}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.amountLabel}>
                            {isAchieved
                              ? "Total Earned (Achieved)"
                              : isInProgress
                              ? "Current Earned"
                              : "Snapshotted Final"}
                          </Text>
                          <Text style={styles.amountEarnedVal}>
                            ₹{earned.toLocaleString("en-IN")}{" "}
                            <Text style={styles.percentText}>({percent}%)</Text>
                          </Text>
                        </View>
                      </View>

                      {/* Progress Track */}
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${percent}%`,
                              backgroundColor: isAchieved
                                ? THEME.positiveText
                                : THEME.darkRose,
                            },
                          ]}
                        />
                      </View>

                      {/* Footer & Actions */}
                      <View style={styles.cardFooterRow}>
                        <Text style={styles.cardFooterSub}>
                          {isAchieved
                            ? "Goal achieved! 🎉"
                            : isMissed
                            ? `Short by ₹${remaining.toLocaleString("en-IN")}`
                            : `₹${remaining.toLocaleString("en-IN")} to go`}
                        </Text>

                        {/* Action buttons */}
                        <View style={styles.cardActionBtns}>
                          <TouchableOpacity
                            onPress={() => startEditGoal(goal)}
                            style={styles.cardIconBtn}
                            hitSlop={6}
                          >
                            <Feather
                              name="edit-2"
                              size={14}
                              color={THEME.textSecondary}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteGoal(goal)}
                            style={styles.cardIconBtn}
                            hitSlop={6}
                          >
                            <Feather
                              name="trash-2"
                              size={14}
                              color={THEME.darkRose}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
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
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: THEME.cardBorderSubtle,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.accentPinkLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: THEME.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 1,
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.darkRose,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  headerAddBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  summaryBar: {
    flexDirection: "row",
    backgroundColor: "#FFF4F7",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingVertical: 14,
    paddingHorizontal: 10,
    justifyContent: "space-around",
    alignItems: "center",
  },
  summaryStatItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryStatValue: {
    fontSize: 18,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  summaryStatLabel: {
    fontSize: 10,
    color: THEME.textSecondary,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: THEME.cardBorder,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: THEME.textPrimary,
    paddingVertical: 0,
  },
  filterChipsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#FCE4EC",
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: THEME.darkRose,
    borderColor: THEME.darkRose,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  goalList: {
    gap: 12,
  },
  goalCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
    shadowColor: "#D94876",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  goalCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  goalCardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  goalCardMonth: {
    fontSize: 12,
    color: THEME.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  goalDateSub: {
    fontSize: 11,
    color: THEME.textMuted,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeAchieved: {
    backgroundColor: THEME.positiveBg,
    borderWidth: 1,
    borderColor: THEME.positiveBorder,
  },
  statusBadgeMissed: {
    backgroundColor: THEME.missedBg,
    borderWidth: 1,
    borderColor: THEME.missedBorder,
  },
  statusBadgeInProgress: {
    backgroundColor: "#FCE4EC",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusTextAchieved: { color: THEME.positiveText },
  statusTextMissed: { color: THEME.missedText },
  statusTextInProgress: { color: THEME.deepBerry },
  goalCardAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    marginBottom: 6,
  },
  amountLabel: {
    fontSize: 10,
    color: THEME.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  amountTargetVal: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.textPrimary,
    marginTop: 2,
  },
  amountEarnedVal: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.darkRose,
    marginTop: 2,
  },
  percentText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textSecondary,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.trackBg,
    overflow: "hidden",
    marginVertical: 6,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  cardFooterSub: {
    fontSize: 11,
    color: THEME.textSecondary,
    fontWeight: "600",
  },
  cardActionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardIconBtn: {
    padding: 6,
    backgroundColor: "#FFF4F7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
    paddingHorizontal: 20,
    backgroundColor: "#FFF9FA",
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.cardBorder,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: THEME.accentPinkLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: THEME.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.darkRose,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  emptyAddBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 18,
  },
  formCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.cardBorderSubtle,
  },
  formHeaderTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.accentPinkLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  formCloseBtn: {
    padding: 6,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: THEME.textSecondary,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FFF9FA",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: THEME.textPrimary,
    fontWeight: "600",
  },
  amtRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FFF9FA",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rupee: {
    fontSize: 20,
    fontWeight: "700",
    marginRight: 6,
    color: THEME.darkRose,
  },
  amtInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  presetWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FFFFFF",
  },
  presetChipActive: {
    backgroundColor: THEME.darkRose,
    borderColor: THEME.darkRose,
  },
  presetText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  presetTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  rowFields: {
    flexDirection: "row",
    alignItems: "center",
  },
  formBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.darkRose,
    shadowColor: THEME.darkRose,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  saveBtnDisabled: {
    backgroundColor: "#E5E5EA",
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
