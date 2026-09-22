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
import { Platform } from "react-native";
//Dont remove comment this gesture handler is breaking the app
// import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseContext";
import { requestNotificationPermissions } from "@/utils/notifications";
import { checkForUpdate, UpdateInfo } from "@/utils/githubUpdater";

// ─── Update Context ─────────────────────────────────────────────────────────────
// Share the update check result across the whole app (Profile screen uses it).
interface UpdateContextValue {
  updateInfo:    UpdateInfo | null;
  isChecking:    boolean;
  recheckUpdate: () => Promise<void>;
}

export const UpdateContext = createContext<UpdateContextValue>({
  updateInfo:    null,
  isChecking:    false,
  recheckUpdate: async () => {},
});

export function useUpdateContext() {
  return useContext(UpdateContext);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="order/new"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen name="kanban" options={{ headerShown: false }} />
      <Stack.Screen name="customers/index" options={{ headerShown: false }} />
      <Stack.Screen name="customers/[id]" options={{ headerShown: false }} />
    </Stack>
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

  async function recheckUpdate(force = false) {
    if (Platform.OS !== 'android') return;
    setIsChecking(true);
    try {
      const info = await checkForUpdate(force);
      if (info) setUpdateInfo(info);
    } catch (e) {
      console.warn('[Updater] check failed:', e);
    } finally {
      setIsChecking(false);
    }
  }

  // Silent background check on app open (7-day throttled)
  useEffect(() => { recheckUpdate(false); }, []);

  return (
    <UpdateContext.Provider value={{ updateInfo, isChecking, recheckUpdate: () => recheckUpdate(true) }}>
      {children}
    </UpdateContext.Provider>
  );
}
