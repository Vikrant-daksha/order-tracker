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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DatabaseProvider } from "@/context/DatabaseContext";
import * as Notifications from "expo-notifications";
import { requestNotificationPermissions } from "@/utils/notifications";
import {
  checkForUpdate,
  getLastCheckDate,
  getActiveDownloadState,
  downloadAndInstall,
  installDownloadedApk,
  openDownloadInBrowser,
  addDownloadProgressListener,
  removeDownloadProgressListener,
  UpdateInfo,
} from "@/utils/githubUpdater";
import { ChatBubble } from "@/components/ChatBubble";

// ─── Update Context ─────────────────────────────────────────────────────────────
// Share the update check result & background download status across the whole app.
interface UpdateContextValue {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  lastChecked: number | null;
  recheckUpdate: () => Promise<void>;
  downloadProgress: number | null;
  isDownloading: boolean;
  isReadyToInstall: boolean;
  startUpdateDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  downloadInBrowser: () => Promise<void>;
}

export const UpdateContext = createContext<UpdateContextValue>({
  updateInfo: null,
  isChecking: false,
  lastChecked: null,
  recheckUpdate: async () => {},
  downloadProgress: null,
  isDownloading: false,
  isReadyToInstall: false,
  startUpdateDownload: async () => {},
  installUpdate: async () => {},
  downloadInBrowser: async () => {},
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
        <Stack.Screen name="goals" options={{ headerShown: false }} />
        <Stack.Screen name="expenses" options={{ headerShown: false }} />
        <Stack.Screen name="customers/index" options={{ headerShown: false }} />
        <Stack.Screen name="customers/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="customers/edit/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="chat"
          options={{ headerShown: false, presentation: "modal" }}
        />
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
              <GestureHandlerRootView style={{ flex: 1 }}>
                <RootLayoutNav />
              </GestureHandlerRootView>
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
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReadyToInstall, setIsReadyToInstall] = useState(false);

  async function refreshLastChecked() {
    const ts = await getLastCheckDate();
    setLastChecked(ts);
  }

  async function checkDownloadStatus() {
    if (Platform.OS !== "android") return;
    try {
      const state = await getActiveDownloadState();
      if (state?.isComplete) {
        setIsReadyToInstall(true);
        setDownloadProgress(1);
        setIsDownloading(false);
      } else if (state && state.progress > 0 && state.progress < 1) {
        setDownloadProgress(state.progress);
        setIsDownloading(false); // Can be resumed
      }
    } catch {}
  }

  async function recheckUpdate(force = false) {
    if (Platform.OS !== "android") return;
    setIsChecking(true);
    try {
      const info = await checkForUpdate(force);
      if (info) setUpdateInfo(info);
      await refreshLastChecked();
      await checkDownloadStatus();
    } catch (e) {
      console.warn("[Updater] check failed:", e);
    } finally {
      setIsChecking(false);
    }
  }

  useEffect(() => {
    refreshLastChecked();
    checkDownloadStatus();
    recheckUpdate(false);

    // Subscribe to active download progress updates
    const listener = (progress: number) => {
      setDownloadProgress(progress);
      if (progress >= 1) {
        setIsDownloading(false);
        setIsReadyToInstall(true);
      }
    };
    addDownloadProgressListener(listener);

    // Handle tapping the download completion notification
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.action === "INSTALL_UPDATE" && typeof data?.fileUri === "string") {
          installDownloadedApk(data.fileUri).catch(console.error);
        }
      },
    );

    return () => {
      removeDownloadProgressListener(listener);
      sub.remove();
    };
  }, []);

  async function startUpdateDownload() {
    if (!updateInfo?.apkUrl) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    setIsReadyToInstall(false);
    try {
      await downloadAndInstall(
        updateInfo.apkUrl,
        updateInfo.latestVersion,
        (p) => setDownloadProgress(p),
      );
      setIsReadyToInstall(true);
    } catch (e: any) {
      console.error("[Updater] Download failed:", e);
      throw e;
    } finally {
      setIsDownloading(false);
    }
  }

  async function installUpdate() {
    await installDownloadedApk();
  }

  async function downloadInBrowser() {
    if (!updateInfo?.apkUrl) return;
    await openDownloadInBrowser(updateInfo.apkUrl);
  }

  return (
    <UpdateContext.Provider
      value={{
        updateInfo,
        isChecking,
        lastChecked,
        recheckUpdate: () => recheckUpdate(true),
        downloadProgress,
        isDownloading,
        isReadyToInstall,
        startUpdateDownload,
        installUpdate,
        downloadInBrowser,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}
