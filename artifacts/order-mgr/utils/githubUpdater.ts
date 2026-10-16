/**
 * utils/githubUpdater.ts
 * Self-update via GitHub Releases with background download and resume support.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

const GITHUB_OWNER = "Vikrant-daksha";
const GITHUB_REPO = "order-tracker";
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LAST_CHECK_KEY = "@orderflow_last_update_check";
export const ACTIVE_DOWNLOAD_KEY = "@orderflow_active_download";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const APK_FILE_PATH = `${FileSystem.cacheDirectory}orderflow_update.apk`;

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  apkUrl: string;
  releaseNotes: string;
  htmlUrl: string;
}

export interface DownloadState {
  apkUrl: string;
  fileUri: string;
  version: string;
  progress: number;
  isComplete: boolean;
  savableData?: any;
}

let activeDownloadResumable: FileSystem.DownloadResumable | null = null;
const progressListeners = new Set<(progress: number) => void>();

export function addDownloadProgressListener(listener: (p: number) => void) {
  progressListeners.add(listener);
}

export function removeDownloadProgressListener(listener: (p: number) => void) {
  progressListeners.delete(listener);
}

function notifyProgress(p: number) {
  progressListeners.forEach((l) => {
    try {
      l(p);
    } catch {}
  });
}

function isNewerVersion(local: string, remote: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPatch] = parse(local);
  const [rMaj, rMin, rPatch] = parse(remote);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPatch > lPatch;
}

export async function checkForUpdate(
  forceCheck = false,
): Promise<UpdateInfo | null> {
  if (Platform.OS !== "android") return null;

  if (!forceCheck) {
    const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (lastCheck) {
      const elapsed = Date.now() - parseInt(lastCheck, 10);
      if (elapsed < SEVEN_DAYS_MS) return null;
    }
  }

  await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

  const response = await fetch(API_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    console.warn("[Updater] GitHub API error:", response.status);
    return null;
  }

  const release = await response.json();
  const latestVersion = (release.tag_name as string).replace(/^v/, "");
  const currentVersion = (Constants.expoConfig?.version ?? "0.0.0").replace(
    /^v/,
    "",
  );

  const apkAsset = (release.assets as any[]).find(
    (a: any) =>
      typeof a.name === "string" && a.name.toLowerCase().endsWith(".apk"),
  );

  return {
    hasUpdate: isNewerVersion(currentVersion, latestVersion),
    latestVersion,
    currentVersion,
    apkUrl: apkAsset?.browser_download_url ?? "",
    releaseNotes: release.body ?? "",
    htmlUrl: release.html_url ?? "",
  };
}

export async function getActiveDownloadState(): Promise<DownloadState | null> {
  if (Platform.OS !== "android") return null;
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_DOWNLOAD_KEY);
    if (!raw) return null;
    const parsed: DownloadState = JSON.parse(raw);

    // If marked complete, ensure the file actually exists on disk
    if (parsed.isComplete) {
      const info = await FileSystem.getInfoAsync(
        parsed.fileUri || APK_FILE_PATH,
      );
      if (!info.exists || (info.size && info.size < 1000000)) {
        await AsyncStorage.removeItem(ACTIVE_DOWNLOAD_KEY);
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function installDownloadedApk(
  customFileUri?: string,
): Promise<void> {
  if (Platform.OS !== "android") return;
  const fileUri = customFileUri || APK_FILE_PATH;
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error("Update APK file not found. Please re-download.");
  }

  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  const { startActivityAsync } = await import("expo-intent-launcher");
  await startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: "application/vnd.android.package-archive",
  });
}

export async function downloadAndInstall(
  apkUrl: string,
  onProgressOrVersion?: ((progress: number) => void) | string,
  maybeOnProgress?: (progress: number) => void,
): Promise<void> {
  if (Platform.OS !== "android") return;

  let targetVersion = "update";
  let onProgress: ((progress: number) => void) | undefined;

  if (typeof onProgressOrVersion === "string") {
    targetVersion = onProgressOrVersion;
    onProgress = maybeOnProgress;
  } else if (typeof onProgressOrVersion === "function") {
    onProgress = onProgressOrVersion;
  }

  const fileUri = APK_FILE_PATH;

  // Check if an existing complete download is already available
  const existing = await getActiveDownloadState();
  if (existing && existing.apkUrl === apkUrl && existing.isComplete) {
    onProgress?.(1);
    notifyProgress(1);
    await installDownloadedApk(fileUri);
    return;
  }

  // Remove stale incomplete APK if URL changed
  if (existing && existing.apkUrl !== apkUrl) {
    try {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch {}
  }

  // Save initial download state
  await AsyncStorage.setItem(
    ACTIVE_DOWNLOAD_KEY,
    JSON.stringify({
      apkUrl,
      fileUri,
      version: targetVersion,
      progress: 0,
      isComplete: false,
    } as DownloadState),
  );

  // Send a background notification that download has started
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Downloading OrderFlow Update",
        body: `v${targetVersion} is downloading in the background...`,
        data: { apkUrl, fileUri },
      },
      trigger: null,
    });
  } catch (e) {
    console.warn("[Updater] Could not schedule start notification:", e);
  }

  let lastPct = 0;
  let lastSavedTime = 0;

  activeDownloadResumable = FileSystem.createDownloadResumable(
    apkUrl,
    fileUri,
    {
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    },
    async (downloadProgress) => {
      const total = downloadProgress.totalBytesExpectedToWrite;
      if (total <= 0) return;
      const pct = downloadProgress.totalBytesWritten / total;

      if (pct - lastPct >= 0.01 || pct >= 1) {
        lastPct = pct;
        onProgress?.(pct);
        notifyProgress(pct);

        const now = Date.now();
        if (now - lastSavedTime > 3000 || pct >= 1) {
          lastSavedTime = now;
          try {
            const savable = activeDownloadResumable?.savable();
            await AsyncStorage.setItem(
              ACTIVE_DOWNLOAD_KEY,
              JSON.stringify({
                apkUrl,
                fileUri,
                version: targetVersion,
                progress: pct,
                isComplete: pct >= 1,
                savableData: savable,
              } as DownloadState),
            );
          } catch {}
        }
      }
    },
  );

  try {
    const result = await activeDownloadResumable.downloadAsync();
    if (!result?.uri) {
      throw new Error("Download failed: No file URI returned.");
    }

    // Mark complete
    await AsyncStorage.setItem(
      ACTIVE_DOWNLOAD_KEY,
      JSON.stringify({
        apkUrl,
        fileUri: result.uri,
        version: targetVersion,
        progress: 1,
        isComplete: true,
      } as DownloadState),
    );

    onProgress?.(1);
    notifyProgress(1);

    // Notify user that update is ready to install
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "OrderFlow Update is Ready!",
          body: `Version ${targetVersion} has finished downloading. Tap to install now.`,
          data: { fileUri: result.uri, action: "INSTALL_UPDATE" },
        },
        trigger: null,
      });
    } catch {}

    // Prompt package installer
    await installDownloadedApk(result.uri);
  } finally {
    activeDownloadResumable = null;
  }
}

export async function openDownloadInBrowser(apkUrl: string): Promise<void> {
  if (!apkUrl) return;
  await Linking.openURL(apkUrl);
}

export async function cancelActiveDownload(): Promise<void> {
  if (activeDownloadResumable) {
    try {
      await activeDownloadResumable.cancelAsync();
    } catch {}
    activeDownloadResumable = null;
  }
  await AsyncStorage.removeItem(ACTIVE_DOWNLOAD_KEY);
  try {
    await FileSystem.deleteAsync(APK_FILE_PATH, { idempotent: true });
  } catch {}
  notifyProgress(0);
}

export async function getLastCheckDate(): Promise<number | null> {
  const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
  return lastCheck ? parseInt(lastCheck, 10) : null;
}

export async function resetUpdateCheckTimer(): Promise<void> {
  await AsyncStorage.removeItem(LAST_CHECK_KEY);
}
