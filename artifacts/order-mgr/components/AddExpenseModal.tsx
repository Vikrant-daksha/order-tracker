import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useDatabase } from "@/context/DatabaseContext";
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
  const { expenses } = useDatabase();
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

  // Dynamically merge defaults, saved custom categories, and any categories in past expenses
  const allCategories = useMemo(() => {
    const fromExpenses = (expenses || [])
      .map((e) => e.category)
      .filter(Boolean);
    const set = new Set([
      ...DEFAULT_CATEGORIES,
      ...customCats,
      ...fromExpenses,
    ]);
    return Array.from(set);
  }, [customCats, expenses]);

  // Load saved custom categories
  useEffect(() => {
    AsyncStorage.getItem(CUSTOM_CATS_KEY).then((v) => {
      if (v) {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) setCustomCats(parsed);
        } catch {}
      }
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

    let finalCategory = category;
    if (addingCustom && customInput.trim()) {
      finalCategory = customInput.trim();
      if (
        !customCats.includes(finalCategory) &&
        !DEFAULT_CATEGORIES.includes(finalCategory)
      ) {
        const next = [...customCats, finalCategory];
        setCustomCats(next);
        AsyncStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(next));
      }
    }

    if (!finalCategory) {
      finalCategory = allCategories[0] || "Other";
    }

    onSave({
      amount: amt,
      category: finalCategory,
      note: note.trim(),
      date: date || todayStr(),
    });
    onClose();
  }

  async function handleAddCustom() {
    const name = customInput.trim();
    if (!name) return;
    if (!customCats.includes(name) && !DEFAULT_CATEGORIES.includes(name)) {
      const next = [...customCats, name];
      setCustomCats(next);
      await AsyncStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(next));
    }
    setCategory(name);
    setAddingCustom(false);
    setCustomInput("");
  }

  async function handleDeleteCustom(catToDelete: string) {
    const next = customCats.filter((c) => c !== catToDelete);
    setCustomCats(next);
    await AsyncStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(next));
    if (category === catToDelete) {
      setCategory(DEFAULT_CATEGORIES[0]);
    }
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
              <View style={styles.catHeaderRow}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: colors.mutedForeground, marginBottom: 0 },
                  ]}
                >
                  Category
                </Text>
              </View>

              <View style={styles.catWrap}>
                {allCategories.map((cat) => {
                  const isSelected = !addingCustom && category === cat;
                  const isCustomCat = !DEFAULT_CATEGORIES.includes(cat);

                  return (
                    <Pressable
                      key={cat}
                      onPress={() => {
                        setCategory(cat);
                        setAddingCustom(false);
                        setCustomInput("");
                      }}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : colors.muted,
                          borderColor: isSelected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.catText,
                          {
                            color: isSelected
                              ? colors.primaryForeground
                              : colors.mutedForeground,
                            fontWeight: isSelected ? "600" : "500",
                          },
                        ]}
                      >
                        {cat}
                      </Text>
                      {isCustomCat && (
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeleteCustom(cat);
                          }}
                          style={styles.deleteCatIcon}
                        >
                          <Feather
                            name="x"
                            size={12}
                            color={
                              isSelected
                                ? colors.primaryForeground
                                : colors.mutedForeground
                            }
                          />
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}

                {/* + Custom quick chip (if not already opened) */}
                {!addingCustom && (
                  <Pressable
                    onPress={() => {
                      setAddingCustom(true);
                      setCategory("");
                    }}
                    style={[
                      styles.catChip,
                      {
                        borderColor: colors.border,
                        backgroundColor: "transparent",
                        borderStyle: "dashed",
                      },
                    ]}
                  >
                    <Feather
                      name="plus"
                      size={12}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.catText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Custom
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Dedicated full-width Custom Category Creation Card */}
              {addingCustom && (
                <View
                  style={[
                    styles.customCard,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <View style={styles.customCardHeader}>
                    <Text
                      style={[
                        styles.customCardTitle,
                        { color: colors.foreground },
                      ]}
                    >
                      New Category Name
                    </Text>
                    <Pressable
                      onPress={() => {
                        setAddingCustom(false);
                        setCustomInput("");
                        setCategory(allCategories[0] || "Supplies");
                      }}
                      hitSlop={8}
                      style={styles.customCardCloseBtn}
                    >
                      <Feather
                        name="x"
                        size={15}
                        color={colors.mutedForeground}
                      />
                    </Pressable>
                  </View>

                  <View
                    style={[
                      styles.customInputContainer,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <TextInput
                      style={[
                        styles.customInputFull,
                        { color: colors.foreground },
                      ]}
                      value={customInput}
                      onChangeText={(val) => {
                        setCustomInput(val);
                        if (val.trim()) {
                          setCategory(val.trim());
                        }
                      }}
                      placeholder="e.g. Salon Rent, Marketing, Tools"
                      placeholderTextColor={colors.mutedForeground}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleAddCustom}
                    />
                    <Pressable
                      onPress={handleAddCustom}
                      disabled={!customInput.trim()}
                      style={[
                        styles.customConfirmBtn,
                        {
                          backgroundColor: customInput.trim()
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name="check"
                        size={15}
                        color={colors.primaryForeground}
                      />
                    </Pressable>
                  </View>
                </View>
              )}
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
  catHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  addCustomLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  addCustomLinkText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  catWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  deleteCatIcon: {
    padding: 2,
  },
  customCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  customCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  customCardTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  customCardCloseBtn: {
    padding: 2,
  },
  customInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 4,
  },
  customInputFull: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    paddingVertical: 4,
  },
  customConfirmBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
