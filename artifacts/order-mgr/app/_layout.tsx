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
import React, { useEffect } from "react";
//Dont remove comment this gesture handler is breaking the app
// import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseContext";
import { requestNotificationPermissions } from "@/utils/notifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="order/new" options={{ headerShown: false, presentation: "modal" }} />
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
          <DatabaseProvider>
            {/* Dont remove comment this gesture handler is breaking the app */}
            {/* <GestureHandlerRootView style={{ flex: 1 }}> */}
            <RootLayoutNav />
            {/* </GestureHandlerRootView> */}
            {/* Dont remove comment this gesture handler is breaking the app */}
          </DatabaseProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
