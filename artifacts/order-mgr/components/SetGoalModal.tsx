import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
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
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { MonthlyGoal } from "@/types";
import { DatePickerField } from "@/components/DatePickerField";

interface SetGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (targetAmount: number, startDate: string, endDate: string) => void;
  initialGoal?: MonthlyGoal | null;
  currentMonth: string; // "YYYY-MM"
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

export function SetGoalModal({
  visible,
  onClose,
  onSave,
  initialGoal,
  currentMonth,
}: SetGoalModalProps) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(400)).current;

  const defaults = getDefaultDates(currentMonth);
  const [targetAmount, setTargetAmount] = useState("");
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          Animated.timing(slideAnim, {
            toValue: 500,
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
    if (initialGoal) {
      setTargetAmount(String(initialGoal.targetAmount));
      setStartDate(initialGoal.startDate || defaults.start);
      setEndDate(initialGoal.endDate || defaults.end);
    } else {
      setTargetAmount("35000");
      setStartDate(defaults.start);
      setEndDate(defaults.end);
    }
  }, [initialGoal, currentMonth, visible]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 500,
        useNativeDriver: true,
        duration: 200,
      }).start();
    }
  }, [visible]);

  function handleSave() {
    const amt = parseFloat(targetAmount);
    if (!amt || amt <= 0) return;
    onSave(amt, startDate, endDate);
    onClose();
  }

  const isValid = parseFloat(targetAmount) > 0;

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
            {
              backgroundColor: "#FFFFFF",
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header & Drag Handle */}
          <View style={styles.sheetHeader} {...panResponder.panHandlers}>
            <View style={[styles.handle, { backgroundColor: "#F8CCD7" }]} />
          </View>
          <View style={styles.titleRow}>
            <View style={styles.titleGroup}>
              <View style={styles.badgeIcon}>
                <Feather name="flag" size={16} color="#C23363" />
              </View>
              <Text style={styles.title}>
                {initialGoal ? "Update Monthly Goal" : "Set Monthly Goal"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Feather name="x" size={20} color="#8B5E6D" />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Target Amount */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Goal Target Revenue (₹)</Text>
              <View style={styles.amtRow}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  style={styles.amtInput}
                  value={targetAmount}
                  onChangeText={setTargetAmount}
                  keyboardType="decimal-pad"
                  placeholder="35000"
                  placeholderTextColor="#A38590"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  autoFocus
                />
              </View>
            </View>

            {/* Date Range Fields */}
            <View style={styles.rowFields}>
              <View style={[styles.field, { flex: 1 }]}>
                <DatePickerField
                  label="Start Date"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder={defaults.start}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={[styles.field, { flex: 1 }]}>
                <DatePickerField
                  label="End Date"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder={defaults.end}
                />
              </View>
            </View>

            {/* Quick Presets */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Quick Targets</Text>
              <View style={styles.presetWrap}>
                {[20000, 35000, 50000, 75000, 100000].map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => setTargetAmount(String(preset))}
                    style={[
                      styles.presetChip,
                      parseFloat(targetAmount) === preset && styles.presetChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        parseFloat(targetAmount) === preset && styles.presetTextActive,
                      ]}
                    >
                      ₹{(preset / 1000).toFixed(0)}k
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Save Button */}
            <Pressable
              onPress={handleSave}
              disabled={!isValid}
              style={({ pressed }) => [
                styles.saveBtn,
                !isValid && styles.saveBtnDisabled,
                pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
              ]}
            >
              <Feather name="check" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>
                {initialGoal ? "Save Goal" : "Create Goal"}
              </Text>
            </Pressable>

            <View style={{ height: 28 }} />
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "#F8CCD7",
  },
  sheetHeader: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    width: "100%",
  },
  handle: { width: 44, height: 5, borderRadius: 3 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFE4EE",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F8CCD7",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1C1C1E",
    letterSpacing: -0.3,
  },
  closeBtn: { padding: 4 },
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
    color: "#8B5E6D",
  },
  amtRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#F8CCD7",
    backgroundColor: "#FFF9FA",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rupee: {
    fontSize: 22,
    fontWeight: "700",
    marginRight: 6,
    color: "#C23363",
  },
  amtInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "800",
    color: "#1C1C1E",
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
    borderColor: "#F8CCD7",
    backgroundColor: "#FFFFFF",
  },
  presetChipActive: {
    backgroundColor: "#C23363",
    borderColor: "#C23363",
  },
  presetText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8B5E6D",
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
    backgroundColor: "#C23363",
    shadowColor: "#C23363",
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
