/**
 * In-Memory Chat Session Store
 *
 * Keeps chat messages in RAM during the app runtime lifecycle.
 * - Survives screen unmounts / navigations (e.g. going back to Orders and reopening Chat)
 * - Never written to disk/database, so it automatically clears when the user quits the app
 */

import { useState, useEffect } from "react";
import { ChatMessage } from "./aiClient";

// Stored in the JavaScript process heap (RAM)
let memoryMessages: ChatMessage[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const chatStore = {
  getMessages: (): ChatMessage[] => memoryMessages,
  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => {
    if (typeof updater === "function") {
      memoryMessages = updater(memoryMessages);
    } else {
      memoryMessages = updater;
    }
    notify();
  },
  clearMessages: () => {
    memoryMessages = [];
    notify();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Hook to consume in-memory chat messages in any screen/component
 */
export function useChatSession() {
  const [messages, setLocal] = useState<ChatMessage[]>(() =>
    chatStore.getMessages(),
  );

  useEffect(() => {
    return chatStore.subscribe(() => {
      setLocal(chatStore.getMessages());
    });
  }, []);

  return {
    messages,
    setMessages: chatStore.setMessages,
    clearMessages: chatStore.clearMessages,
  };
}
