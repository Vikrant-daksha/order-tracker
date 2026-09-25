import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useDatabase } from "@/context/DatabaseContext";
import { GoalStatus, MonthlyGoal } from "@/types";
import { DatePickerField } from "@/components/DatePickerField";

interface ManageGoalsModalProps {
  visible: boolean;
  onClose: () => void;
}

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

export function ManageGoalsModal({ visible, onClose }: ManageGoalsModalProps) {
  const { orders, goals, setMonthlyGoal, deleteMonthlyGoal } = useDatabase();
  const slideAnim = useRef(new Animated.Value(500)).current;

  const [activeFilter, setActiveFilter] = useState<"All" | "in_progress" | "achieved" | "missed">("All");
  const [isEditing, setIsEditing] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  // Form State
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [targetAmount, setTargetAmount] = useState("35000");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) slideAnim.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          Animated.timing(slideAnim, {
            toValue: 600,
            useNativeDriver: true,
            duration: 200,
          }).start(onClose);
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      setIsEditing(false);
      setEditingGoalId(null);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 600,
        useNativeDriver: true,
        duration: 200,
      }).start();
    }
  }, [visible]);

  function startCreateGoal() {
    const defaults = getDefaultDates(currentMonthKey);
    setSelectedMonth(currentMonthKey);
    setTargetAmount("35000");
    setStartDate(defaults.start);
    setEndDate(defaults.end);
    setEditingGoalId(null);
    setIsEditing(true);
  }

  function startEditGoal(goal: MonthlyGoal) {
    setSelectedMonth(goal.month);
    setTargetAmount(String(goal.targetAmount));
    setStartDate(goal.startDate);
    setEndDate(goal.endDate);
    setEditingGoalId(goal.id);
    setIsEditing(true);
  }

  async function handleSaveGoal() {
    const amt = parseFloat(targetAmount);
    if (!amt || amt <= 0) return;
    await setMonthlyGoal(selectedMonth, amt, startDate, endDate);
    setIsEditing(false);
    setEditingGoalId(null);
  }

  function handleDeleteGoal(goal: MonthlyGoal) {
    if (Platform.OS === "web") {
      if (window.confirm(`Are you sure you want to delete the goal for ${formatMonthTitle(goal.month)}?`)) {
        deleteMonthlyGoal(goal.id);
      }
    } else {
      Alert.alert(
        "Delete Goal",
        `Are you sure you want to delete the goal for ${formatMonthTitle(goal.month)}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteMonthlyGoal(goal.id) },
        ]
      );
    }
  }

  // Calculate live earned amount for any in_progress goal or use snapshotted earnedAmount
  const getGoalStats = (g: MonthlyGoal) => {
    let earned = g.earnedAmount || 0;
    if (g.status === "in_progress") {
      earned = orders
        .filter((o) => {
          const d = (o.orderDate || o.createdAt || "").slice(0, 10);
          return d >= g.startDate && d <= g.endDate;
        })
        .reduce((sum, o) => sum + (o.amountPaid || 0), 0);
    }
    const percent = g.targetAmount > 0 ? Math.min(100, Math.round((earned / g.targetAmount) * 100)) : 0;
    const remaining = Math.max(0, g.targetAmount - earned);
    return { earned, percent, remaining };
  };

  // Filtered goals
  const filteredGoals = goals.filter((g) => {
    if (activeFilter === "All") return true;
    return g.status === activeFilter;
  });

  const totalGoalsCount = goals.length;
  const achievedCount = goals.filter((g) => g.status === "achieved").length;
  const missedCount = goals.filter((g) => g.status === "missed").length;
  const inProgressCount = goals.filter((g) => g.status === "in_progress").length;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.kavWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header Drag Handle */}
          <View style={styles.sheetHeader} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          {/* Title Row */}
          <View style={styles.titleRow}>
            <View style={styles.titleGroup}>
              <View style={styles.badgeIcon}>
                <Feather name="flag" size={16} color={THEME.darkRose} />
              </View>
              <View>
                <Text style={styles.title}>
                  {isEditing ? (editingGoalId ? "Edit Goal" : "Set Monthly Goal") : "Monthly Goals"}
                </Text>
                <Text style={styles.subtitle}>
                  {isEditing ? "Configure revenue target & timeline" : "Track targets & historical snapshots"}
                </Text>
              </View>
            </View>

            <View style={styles.headerRightActions}>
              {!isEditing ? (
                <TouchableOpacity
                  onPress={startCreateGoal}
                  activeOpacity={0.8}
                  style={styles.addGoalBtn}
                >
                  <Feather name="plus" size={14} color="#FFFFFF" />
                  <Text style={styles.addGoalBtnText}>New Goal</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setIsEditing(false)}
                  activeOpacity={0.8}
                  style={styles.backBtn}
                >
                  <Feather name="arrow-left" size={14} color={THEME.darkRose} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
              )}
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
                <Feather name="x" size={20} color={THEME.textSecondary} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {isEditing ? (
              /* --- Create / Edit Goal Form --- */
              <View style={styles.formContainer}>
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

                {/* Date Ranges */}
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

                {/* Save Button */}
                <TouchableOpacity
                  onPress={handleSaveGoal}
                  disabled={!parseFloat(targetAmount)}
                  activeOpacity={0.85}
                  style={[
                    styles.saveBtn,
                    !parseFloat(targetAmount) && styles.saveBtnDisabled,
                  ]}
                >
                  <Feather name="check" size={18} color="#FFFFFF" />
                  <Text style={styles.saveBtnText}>
                    {editingGoalId ? "Update Goal" : "Save Goal"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* --- Goals List View --- */
              <View>
                {/* Summary Metrics Bar */}
                <View style={styles.summaryBar}>
                  <View style={styles.summaryStatItem}>
                    <Text style={styles.summaryStatValue}>{totalGoalsCount}</Text>
                    <Text style={styles.summaryStatLabel}>Total Goals</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryStatItem}>
                    <Text style={[styles.summaryStatValue, { color: THEME.positiveText }]}>
                      {achievedCount}
                    </Text>
                    <Text style={styles.summaryStatLabel}>Achieved</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryStatItem}>
                    <Text style={[styles.summaryStatValue, { color: THEME.missedText }]}>
                      {missedCount}
                    </Text>
                    <Text style={styles.summaryStatLabel}>Missed</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryStatItem}>
                    <Text style={[styles.summaryStatValue, { color: THEME.deepBerry }]}>
                      {inProgressCount}
                    </Text>
                    <Text style={styles.summaryStatLabel}>Active</Text>
                  </View>
                </View>

                {/* Filter Chips */}
                <View style={styles.filterChipsRow}>
                  {(["All", "in_progress", "achieved", "missed"] as const).map((filter) => {
                    const label =
                      filter === "All"
                        ? "All"
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
                  })}
                </View>

                {/* Goals Card List */}
                {filteredGoals.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconWrap}>
                      <Feather name="target" size={28} color={THEME.darkRose} />
                    </View>
                    <Text style={styles.emptyTitle}>No goals found</Text>
                    <Text style={styles.emptyDesc}>
                      {activeFilter === "All"
                        ? "Set a revenue target to stay on track and review historical monthly achievements."
                        : `No goals currently marked as "${activeFilter.replace("_", " ")}".`}
                    </Text>
                    {activeFilter === "All" && (
                      <TouchableOpacity
                        onPress={startCreateGoal}
                        style={styles.emptyAddBtn}
                      >
                        <Feather name="plus" size={14} color="#FFFFFF" />
                        <Text style={styles.emptyAddBtnText}>Set Your First Goal</Text>
                      </TouchableOpacity>
                    )}
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
                          {/* Card Top Row */}
                          <View style={styles.goalCardHeader}>
                            <View>
                              <Text style={styles.goalMonthTitle}>
                                {formatMonthTitle(goal.month)}
                              </Text>
                              <Text style={styles.goalDateSub}>
                                {formatDateRange(goal.startDate, goal.endDate)}
                              </Text>
                            </View>

                            {/* Status Pill */}
                            <View style={styles.statusPillGroup}>
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

                              {/* Card Actions */}
                              <TouchableOpacity
                                onPress={() => startEditGoal(goal)}
                                style={styles.iconBtn}
                                hitSlop={6}
                              >
                                <Feather name="edit-2" size={14} color={THEME.textSecondary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleDeleteGoal(goal)}
                                style={styles.iconBtn}
                                hitSlop={6}
                              >
                                <Feather name="trash-2" size={14} color={THEME.darkRose} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Amounts Row */}
                          <View style={styles.goalCardAmounts}>
                            <View>
                              <Text style={styles.amountLabel}>Target</Text>
                              <Text style={styles.amountTargetVal}>
                                ₹{goal.targetAmount.toLocaleString("en-IN")}
                              </Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text style={styles.amountLabel}>
                                {isInProgress ? "Current Earned" : "Snapshotted Final"}
                              </Text>
                              <Text style={styles.amountEarnedVal}>
                                ₹{earned.toLocaleString("en-IN")}{" "}
                                <Text style={styles.percentText}>({percent}%)</Text>
                              </Text>
                            </View>
                          </View>

                          {/* Progress Bar */}
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

                          {/* Footer Info */}
                          <View style={styles.cardFooterRow}>
                            <Text style={styles.cardFooterSub}>
                              {isAchieved
                                ? "Target successfully achieved! 🎉"
                                : isMissed
                                ? `Short by ₹${remaining.toLocaleString("en-IN")}`
                                : `₹${remaining.toLocaleString("en-IN")} to go`}
                            </Text>
                            {goal.updatedAt && (
                              <Text style={styles.cardTimestamp}>
                                {isAchieved || isMissed ? "Snapshot Saved" : "Live"}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  kavWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  sheetHeader: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    width: "100%",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: THEME.cardBorder,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.cardBorderSubtle,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  badgeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME.accentPinkLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: THEME.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addGoalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.darkRose,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addGoalBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.accentPinkLight,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backBtnText: {
    color: THEME.darkRose,
    fontSize: 12,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  summaryBar: {
    flexDirection: "row",
    backgroundColor: "#FFF4F7",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 16,
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
  filterChipsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
    borderRadius: 16,
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
  goalMonthTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  goalDateSub: {
    fontSize: 11,
    color: THEME.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginTop: 2,
  },
  statusPillGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  iconBtn: {
    padding: 5,
    backgroundColor: "#FFF4F7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  goalCardAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    marginBottom: 8,
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
  cardTimestamp: {
    fontSize: 10,
    color: THEME.textMuted,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: "#FFF9FA",
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME.cardBorder,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.accentPinkLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: THEME.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 260,
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
  formContainer: {
    paddingTop: 6,
  },
  field: { marginBottom: 16 },
  rowFields: {
    flexDirection: "row",
    alignItems: "center",
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: THEME.textSecondary,
  },
  amtRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: THEME.cardBorder,
    backgroundColor: "#FFF9FA",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rupee: {
    fontSize: 22,
    fontWeight: "700",
    marginRight: 6,
    color: THEME.darkRose,
  },
  amtInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "800",
    color: THEME.textPrimary,
  },
  presetWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textSecondary,
  },
  presetTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  saveBtn: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    backgroundColor: THEME.darkRose,
    shadowColor: THEME.darkRose,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: {
    backgroundColor: "#E5E5EA",
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
