/**
 * utils/githubUpdater.ts
 * Self-update via GitHub Releases.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';


const GITHUB_OWNER   = 'Vikrant-daksha';
const GITHUB_REPO    = 'order-tracker';
const API_URL        = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LAST_CHECK_KEY = '@orderflow_last_update_check';
const SEVEN_DAYS_MS  = 7 * 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  hasUpdate:      boolean;
  latestVersion:  string;
  currentVersion: string;
  apkUrl:         string;
  releaseNotes:   string;
  htmlUrl:        string;
}

function isNewerVersion(local: string, remote: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPatch] = parse(local);
  const [rMaj, rMin, rPatch] = parse(remote);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPatch > lPatch;
}

export async function checkForUpdate(forceCheck = false): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android') return null;

  if (!forceCheck) {
    const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (lastCheck) {
      const elapsed = Date.now() - parseInt(lastCheck, 10);
      if (elapsed < SEVEN_DAYS_MS) return null;
    }
  }

  await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

  const response = await fetch(API_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!response.ok) {
    console.warn('[Updater] GitHub API error:', response.status);
    return null;
  }

  const release = await response.json();
  const latestVersion  = (release.tag_name as string).replace(/^v/, '');
  const currentVersion = (Constants.expoConfig?.version ?? '0.0.0').replace(/^v/, '');

  const apkAsset = (release.assets as any[]).find(
    (a: any) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk')
  );

  return {
    hasUpdate:    isNewerVersion(currentVersion, latestVersion),
    latestVersion,
    currentVersion,
    apkUrl:       apkAsset?.browser_download_url ?? '',
    releaseNotes: release.body ?? '',
    htmlUrl:      release.html_url ?? '',
  };
}

export async function downloadAndInstall(
  apkUrl: string,
  onProgress: (progress: number) => void
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const fileUri = `${FileSystem.cacheDirectory}orderflow_update.apk`;

  // Remove stale APK if present
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (fileInfo.exists) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }

  // Download with progress updates
  const downloadResumable = FileSystem.createDownloadResumable(
    apkUrl,
    fileUri,
    {},
    (downloadProgress) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      const pct = totalBytesExpectedToWrite > 0
        ? totalBytesWritten / totalBytesExpectedToWrite
        : 0;
      onProgress(Math.min(pct, 1));
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    throw new Error('Download failed: No URI returned from downloadResumable');
  }

  // Generate content URI for Android intent (prevents FileUriExposedException)
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  // Launch the Android system package installer
  const { startActivityAsync } = await import('expo-intent-launcher');
  await startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}

export async function resetUpdateCheckTimer(): Promise<void> {
  await AsyncStorage.removeItem(LAST_CHECK_KEY);
}
