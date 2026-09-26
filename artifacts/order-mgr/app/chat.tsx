/**
 * Chat Screen — Full-page AI business assistant
 *
 * Converted from modal to a first-class screen route (/chat)
 * - Uses standard Expo Router stack navigation
 * - No Android modal signature or keyboard glitches
 * - Keeps all local database access & privacy guarantees intact
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseContext";
import {
  sendMessage,
  ChatMessage,
  getRemainingTokens,
  DAILY_TOKEN_LIMIT,
} from "@/utils/aiClient";
import { useChatSession } from "@/utils/chatStore";

// ─── Quick Prompts ────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "How many orders do I have?",
  "What's my revenue this month?",
  "Any overdue orders?",
  "What are my top products?",
  "How much is still unpaid?",
  "What did I spend this week?",
];

// ─── Tool name → friendly label ───────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  getOrderSummary: "Checking orders",
  getRevenueStats: "Calculating revenue",
  getTopProducts: "Finding top products",
  getPendingPayments: "Checking payments",
  getExpenseSummary: "Checking expenses",
  searchOrders: "Searching orders",
  getCustomerOrderHistory: "Looking up customer",
  createOrder: "Creating order",
  createMultipleOrders: "Creating batch orders",
  updateOrderStatus: "Updating status",
  markOrderPaid: "Updating payment",
  addExpense: "Logging expense",
  getCatalog: "Browsing catalog",
  createGoal: "Setting goal",
  setWorkingOnOrder: "Updating workbench",
};

// ─── Message Bubble ───────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  colors,
}: {
  message: ChatMessage;
  colors: any;
}) {
  const isUser = message.role === "user";
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (message.isToolCall) {
    return (
      <Animated.View style={[styles.toolCallRow, { opacity: fadeAnim }]}>
        <ActivityIndicator size="small" color="#C06070" />
        <Text style={[styles.toolCallText, { color: colors.mutedForeground }]}>
          {TOOL_LABELS[message.toolName || ""] || "Working on it"}...
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.bubbleWrapper,
        isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperAI,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarEmoji}>✨</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: "#F8BCCD" }]
            : [
                styles.bubbleAI,
                { backgroundColor: colors.card, borderColor: colors.border },
              ],
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isUser ? "#5C2A38" : colors.foreground },
          ]}
        >
          {message.text}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen Component ────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useDatabase();

  const { messages, setMessages, clearMessages } = useChatSession();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [tokensRemaining, setTokensRemaining] = useState(DAILY_TOKEN_LIMIT);
  const isFirstOpen = messages.length === 0;
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setIsKeyboardOpen(true);
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setIsKeyboardOpen(false);
        setKeyboardHeight(0);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Load token usage on mount
  useEffect(() => {
    getRemainingTokens().then(setTokensRemaining);
  }, []);

  const appData = {
    orders: db.orders,
    products: db.products,
    customers: db.customers,
    expenses: db.expenses,
    goals: db.goals,
    addOrder: db.addOrder,
    updateOrder: db.updateOrder,
    addExpense: db.addExpense,
    addMonthlyGoal: db.addMonthlyGoal,
  };

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || isLoading) return;

      setInput("");
      setIsLoading(true);

      const userMessage: ChatMessage = { role: "user", text: msg };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const { reply, tokensUsed, limitReached } = await sendMessage(
          msg,
          messages,
          appData,
          (toolName) => {
            setActiveToolName(toolName);
            setMessages((prev) => [
              ...prev,
              { role: "model", text: "", isToolCall: true, toolName },
            ]);
          },
        );

        setMessages((prev) => {
          const withoutToolCalls = prev.filter((m) => !m.isToolCall);
          return [...withoutToolCalls, { role: "model", text: reply }];
        });

        getRemainingTokens().then(setTokensRemaining);
      } catch (err: any) {
        setMessages((prev) => {
          const withoutToolCalls = prev.filter((m) => !m.isToolCall);
          return [
            ...withoutToolCalls,
            {
              role: "model",
              text: `Sorry, something went wrong: ${err?.message ?? "Please check your internet connection and try again."}`,
            },
          ];
        });
      } finally {
        setIsLoading(false);
        setActiveToolName(null);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [input, messages, isLoading, appData],
  );

  const tokenPercent = Math.min(
    100,
    (tokensRemaining / DAILY_TOKEN_LIMIT) * 100,
  );

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <MessageBubble message={item} colors={colors} />
  );

  return (
    <View style={[styles.screenRoot, { backgroundColor: colors.background }]}>
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            paddingTop: topPad + 8,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable
            id="chat-back-btn"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backBtn}
          >
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>

          <View style={styles.headerIconWrap}>
            <Text style={styles.headerIcon}>✨</Text>
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              AI Assistant
            </Text>
            <View style={styles.privacyRow}>
              <Feather name="lock" size={10} color={colors.mutedForeground} />
              <Text
                style={[styles.privacyLabel, { color: colors.mutedForeground }]}
              >
                {" "}
                Your data stays on device
              </Text>
            </View>
          </View>
        </View>

        {messages.length > 0 && (
          <TouchableOpacity
            onPress={clearMessages}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <Feather name="trash-2" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Token Bar ──────────────────────────────────────────────────────── */}
      <View style={[styles.tokenBar, { backgroundColor: colors.muted }]}>
        <View style={styles.tokenTrack}>
          <View
            style={[
              styles.tokenFill,
              {
                width: `${tokenPercent}%` as any,
                backgroundColor: tokenPercent > 30 ? "#C6EFC6" : "#FFD4D4",
              },
            ]}
          />
        </View>
        <Text style={[styles.tokenText, { color: colors.mutedForeground }]}>
          {tokensRemaining.toLocaleString()} /{" "}
          {DAILY_TOKEN_LIMIT.toLocaleString()} tokens left today
        </Text>
      </View>

      {/* ─── Body with Keyboard Handling ───────────────────────────────────── */}
      <View
        style={{
          flex: 1,
          paddingBottom: Platform.OS === "android" ? keyboardHeight : 0,
        }}
      >
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? topPad + 44 : 0}
        >
          {/* ─── Messages ───────────────────────────────────────────────────────── */}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.messageList,
              {
                paddingBottom: 16,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
            ListEmptyComponent={
              isFirstOpen ? (
                <View style={styles.emptyState}>
                  <Image
                    source={require("@/assets/images/lightbulb.png")}
                    style={styles.emptyLightbulb}
                    resizeMode="contain"
                  />
                  <Text
                    style={[styles.emptyTitle, { color: colors.foreground }]}
                  >
                    Hi! I'm your business assistant.
                  </Text>
                  <Text
                    style={[
                      styles.emptySubtitle,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    I can check your orders, calculate revenue, and even create
                    new orders — all while keeping your customer info private.
                  </Text>
                  {/* Quick Prompts */}
                  <View style={styles.quickPrompts}>
                    {QUICK_PROMPTS.map((prompt) => (
                      <TouchableOpacity
                        key={prompt}
                        style={[
                          styles.quickChip,
                          {
                            backgroundColor: "#FFF0F5",
                            borderColor: "#F8BCCD",
                          },
                        ]}
                        onPress={() => handleSend(prompt)}
                      >
                        <Text
                          style={[styles.quickChipText, { color: "#C06070" }]}
                        >
                          {prompt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null
            }
          />

          {/* ─── Input Bar ──────────────────────────────────────────────────────── */}
          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom:
                  isKeyboardOpen || keyboardHeight > 0
                    ? 60
                    : Platform.OS === "ios"
                      ? Math.max(insets.bottom, 12) + 6
                      : Platform.OS === "web"
                        ? 12
                        : Math.max(insets.bottom, 12),
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[
                styles.textInput,
                { backgroundColor: colors.muted, color: colors.foreground },
              ]}
              placeholder="Ask me anything about your business..."
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              blurOnSubmit={false}
              onFocus={() => {
                setTimeout(
                  () => listRef.current?.scrollToEnd({ animated: true }),
                  150,
                );
              }}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    input.trim() && !isLoading ? "#C06070" : colors.muted,
                },
              ]}
              onPress={() => handleSend()}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather
                  name="send"
                  size={18}
                  color={input.trim() ? "#fff" : colors.mutedForeground}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  backBtn: {
    paddingRight: 4,
    paddingVertical: 4,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFF0F5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  privacyLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  clearBtn: {
    padding: 8,
  },

  tokenBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tokenTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E5EA",
    overflow: "hidden",
  },
  tokenFill: {
    height: "100%",
    borderRadius: 2,
  },
  tokenText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },

  messageList: {
    padding: 16,
    gap: 10,
    flexGrow: 1,
  },

  bubbleWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "88%",
  },
  bubbleWrapperUser: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  bubbleWrapperAI: {
    alignSelf: "flex-start",
  },

  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFF0F5",
    alignItems: "center",
    justifyContent: "center",
  },
  aiAvatarEmoji: {
    fontSize: 14,
  },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "100%",
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },

  toolCallRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toolCallText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    paddingTop: 32,
    paddingHorizontal: 8,
  },
  emptyLightbulb: {
    width: 120,
    height: 120,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  quickPrompts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  quickChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
