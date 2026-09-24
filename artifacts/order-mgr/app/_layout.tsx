import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
//Dont remove comment this gesture handler is breaking the app
// import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseContext";
import { requestNotificationPermissions } from "@/utils/notifications";
import {
  checkForUpdate,
  getLastCheckDate,
  UpdateInfo,
} from "@/utils/githubUpdater";
import { ChatBubble } from "@/components/ChatBubble";

// ─── Update Context ─────────────────────────────────────────────────────────────
// Share the update check result across the whole app (Profile screen uses it).
interface UpdateContextValue {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  lastChecked: number | null;
  recheckUpdate: () => Promise<void>;
}

export const UpdateContext = createContext<UpdateContextValue>({
  updateInfo: null,
  isChecking: false,
  lastChecked: null,
  recheckUpdate: async () => {},
});

export function useUpdateContext() {
  return useContext(UpdateContext);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="order/new"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen name="kanban" options={{ headerShown: false }} />
        <Stack.Screen name="catalog" options={{ headerShown: false }} />
        <Stack.Screen name="customers/index" options={{ headerShown: false }} />
        <Stack.Screen name="customers/[id]" options={{ headerShown: false }} />
      </Stack>
      {/* Floating AI assistant bubble — appears on every screen above the tab bar */}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    async function initApp() {
      if (fontsLoaded || fontError) {
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          console.warn("Failed to hide splash screen:", e);
        }
        try {
          await requestNotificationPermissions();
        } catch (e) {
          console.warn("Failed to request notifications:", e);
        }
      }
    }
    initApp();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <UpdateProvider>
            <DatabaseProvider>
              {/* Dont remove comment this gesture handler is breaking the app */}
              {/* <GestureHandlerRootView style={{ flex: 1 }}> */}
              <RootLayoutNav />
              {/* </GestureHandlerRootView> */}
              {/* Dont remove comment this gesture handler is breaking the app */}
            </DatabaseProvider>
          </UpdateProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// ─── Update Provider ────────────────────────────────────────────────────────────
function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  async function refreshLastChecked() {
    const ts = await getLastCheckDate();
    setLastChecked(ts);
  }

  async function recheckUpdate(force = false) {
    if (Platform.OS !== "android") return;
    setIsChecking(true);
    try {
      const info = await checkForUpdate(force);
      if (info) setUpdateInfo(info);
      await refreshLastChecked();
    } catch (e) {
      console.warn("[Updater] check failed:", e);
    } finally {
      setIsChecking(false);
    }
  }

  // Silent background check on app open (7-day throttled)
  useEffect(() => {
    refreshLastChecked();
    recheckUpdate(false);
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        updateInfo,
        isChecking,
        lastChecked,
        recheckUpdate: () => recheckUpdate(true),
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}
