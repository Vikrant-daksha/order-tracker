/**
 * ChatBubble — Floating AI assistant trigger button
 *
 * A pulsing pink bubble that floats above the tab bar.
 * Tapping it opens the ChatModal.
 */

import React from "react";
import { Animated, StyleSheet, TouchableOpacity, Platform, Text } from "react-native";
import { useRouter } from "expo-router";

export function ChatBubble() {
  const router = useRouter();

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ scale: 1 }] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        id="ai-chat-bubble-btn"
        style={styles.bubble}
        onPress={() => router.push("/chat" as any)}
        activeOpacity={0.85}
      >
        <Text style={styles.icon}>✨</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 88 : 100;

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: 20,
    bottom: TAB_BAR_HEIGHT + 12,
    zIndex: 999,
  },
  bubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#C06070",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#C06070",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    fontSize: 22,
  },
});
