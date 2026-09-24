import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { Expense, ExpenseCategory } from "@/types";
import { DatePickerField } from "@/components/DatePickerField";

const CUSTOM_CATS_KEY = "@orderflow_custom_expense_cats";
const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  "Supplies",
  "Packaging",
  "Shipping",
  "Marketing",
  "Equipment",
  "Other",
];

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<Expense, "id" | "createdAt">) => void;
  initialExpense?: Expense | null;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function AddExpenseModal({
  visible,
  onClose,
  onSave,
  initialExpense,
}: AddExpenseModalProps) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(400)).current;

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Supplies");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const listRef = useRef<ScrollView>(null);

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

  const allCategories = [...DEFAULT_CATEGORIES, ...customCats];

  // Load saved custom categories
  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_CATS_KEY).then((v) => {
      if (v) setCustomCats(JSON.parse(v));
    });
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setIsKeyboardOpen(true);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setIsKeyboardOpen(false);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Pre-fill when editing
  useEffect(() => {
    if (initialExpense) {
      setAmount(String(initialExpense.amount));
      setCategory(initialExpense.category);
      setNote(initialExpense.note);
      setDate(initialExpense.date);
    } else {
      setAmount("");
      setCategory("Supplies");
      setNote("");
      setDate(todayStr());
    }
    setAddingCustom(false);
    setCustomInput("");
  }, [initialExpense, visible]);

  // Slide in/out
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
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    onSave({
      amount: amt,
      category,
      note: note.trim(),
      date: date || todayStr(),
    });
    onClose();
  }

  async function handleAddCustom() {
    const name = customInput.trim();
    if (!name) return;
    const next = [...customCats, name];
    setCustomCats(next);
    await AsyncStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(next));
    setCategory(name);
    setAddingCustom(false);
    setCustomInput("");
  }

  const isValid = parseFloat(amount) > 0;

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
              backgroundColor: colors.card,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header & Drag Handle */}
          <View style={styles.sheetHeader} {...panResponder.panHandlers}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {initialExpense ? "Edit Expense" : "Add Expense"}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Amount */}
            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                Amount (₹)
              </Text>
              <View
                style={[
                  styles.amtRow,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.rupee, { color: colors.mutedForeground }]}>
                  ₹
                </Text>
                <TextInput
                  style={[styles.amtInput, { color: colors.foreground }]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
              </View>
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                Category
              </Text>
              <View style={styles.catWrap}>
                {allCategories.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor:
                          category === cat ? colors.primary : colors.muted,
                        borderColor:
                          category === cat ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catText,
                        {
                          color:
                            category === cat
                              ? colors.primaryForeground
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
                {addingCustom ? (
                  <View
                    style={[
                      styles.customInputRow,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.muted,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.customInput, { color: colors.foreground }]}
                      value={customInput}
                      onChangeText={setCustomInput}
                      placeholder="Category name"
                      placeholderTextColor={colors.mutedForeground}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleAddCustom}
                    />
                    <Pressable
                      onPress={handleAddCustom}
                      style={[
                        styles.customSaveBtn,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <Feather
                        name="check"
                        size={14}
                        color={colors.primaryForeground}
                      />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setAddingCustom(true)}
                    style={[
                      styles.catChip,
                      {
                        borderColor: colors.border,
                        backgroundColor: "transparent",
                        borderStyle: "dashed",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.catText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      + Custom
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Note */}
            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                Note (optional)
              </Text>
              <TextInput
                style={[
                  styles.noteInput,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Bought canvas sheets"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            {/* Date */}
            <View style={styles.field}>
              <DatePickerField
                label="Date"
                value={date}
                onChange={setDate}
                placeholder={todayStr()}
              />
            </View>

            {/* Save */}
            <Pressable
              onPress={handleSave}
              disabled={!isValid}
              style={[
                styles.saveBtn,
                { backgroundColor: isValid ? colors.primary : colors.muted },
              ]}
            >
              <Text
                style={[
                  styles.saveBtnText,
                  {
                    color: isValid
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  },
                ]}
              >
                {initialExpense ? "Save Changes" : "Add Expense"}
              </Text>
            </Pressable>

            <View style={{ height: 32 }} />
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
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  closeBtn: { padding: 4 },
  field: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amtRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rupee: { fontSize: 20, fontFamily: "Inter_600SemiBold", marginRight: 6 },
  amtInput: { flex: 1, fontSize: 28, fontFamily: "Inter_700Bold" },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
  },
  customInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    paddingVertical: 3,
  },
  customSaveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  noteInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
