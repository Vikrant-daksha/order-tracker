/**
 * ChatBubble — Floating AI assistant trigger button
 *
 * A pulsing pink bubble that floats above the tab bar.
 * Tapping it opens the ChatModal.
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Text } from "react-native";
import { ChatModal } from "./ChatModal";

export function ChatBubble() {
  const [modalVisible, setModalVisible] = useState(false);

  // Gentle pulse animation to draw attention

  return (
    <>
      <Animated.View
        style={[styles.wrapper, { transform: [{ scale: 1 }] }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          id="ai-chat-bubble-btn"
          style={styles.bubble}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.icon}>✨</Text>
        </TouchableOpacity>
      </Animated.View>

      <ChatModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
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
