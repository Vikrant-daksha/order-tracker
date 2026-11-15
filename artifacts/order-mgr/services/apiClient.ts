import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './syncApi';

const IS_WEB = Platform.OS === 'web';
const USER_KEY = '@orderflow_user';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase | null {
  if (IS_WEB) return null;
  if (!db) {
    try {
      db = SQLite.openDatabaseSync('orderflow.db');
    } catch (e) {
      console.warn('[apiClient] Failed to open SQLite DB:', e);
    }
  }
  return db;
}

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Retrieves the latest auth tokens from SQLite (native) or AsyncStorage (web).
 */
export async function getStoredTokens(): Promise<StoredTokens> {
  // 1. Try SQLite on native devices
  if (!IS_WEB) {
    const sqlite = getDb();
    if (sqlite) {
      try {
        const row = sqlite.getFirstSync<{ access_token?: string; refresh_token?: string }>(
          'SELECT access_token, refresh_token FROM user LIMIT 1'
        );
        if (row?.access_token) {
          return {
            accessToken: row.access_token || null,
            refreshToken: row.refresh_token || null,
          };
        }
      } catch (err) {
        console.warn('[apiClient] Error reading tokens from SQLite:', err);
      }
    }
  }

  // 2. Fallback to AsyncStorage (web and backup)
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        accessToken: parsed.access_token || null,
        refreshToken: parsed.refresh_token || null,
      };
    }
  } catch (err) {
    console.warn('[apiClient] Error reading tokens from AsyncStorage:', err);
  }

  return { accessToken: null, refreshToken: null };
}

/**
 * Updates stored access and refresh tokens across both SQLite and AsyncStorage.
 */
export async function updateStoredTokens(
  newAccessToken: string,
  newRefreshToken?: string
): Promise<void> {
  if (!IS_WEB) {
    const sqlite = getDb();
    if (sqlite) {
      try {
        if (newRefreshToken) {
          sqlite.runSync(
            'UPDATE user SET access_token = ?, refresh_token = ?',
            [newAccessToken, newRefreshToken]
          );
        } else {
          sqlite.runSync('UPDATE user SET access_token = ?', [newAccessToken]);
        }
      } catch (err) {
        console.warn('[apiClient] Failed to update tokens in SQLite:', err);
      }
    }
  }

  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.access_token = newAccessToken;
      if (newRefreshToken) parsed.refresh_token = newRefreshToken;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(parsed));
    }
  } catch (err) {
    console.warn('[apiClient] Failed to update tokens in AsyncStorage:', err);
  }
}

// Queue / flag to avoid duplicate concurrent refresh calls
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAuthToken(refreshToken: string): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (data.success && data.accessToken) {
        await updateStoredTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
      }
      return null;
    } catch (err) {
      console.warn('[apiClient] Silent token refresh failed:', err);
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export interface ApiFetchOptions extends RequestInit {
  /** Skip attaching the Authorization header (e.g. for login or register endpoints) */
  skipAuth?: boolean;
}

/**
 * Shared fetch wrapper that:
 * 1. Resolves relative endpoints against API_BASE_URL.
 * 2. Automatically reads the stored access token from SQLite/AsyncStorage and attaches Authorization: Bearer <token>.
 * 3. Handles automatic silent token refresh on HTTP 401 and transparently retries the failed request.
 */
export async function apiFetch(
  endpointOrUrl: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  let url: string;
  if (endpointOrUrl.startsWith('http://') || endpointOrUrl.startsWith('https://')) {
    url = endpointOrUrl;
  } else {
    let cleanedEndpoint = endpointOrUrl.replace(/^\/+/, '');
    const baseTrimmed = API_BASE_URL.replace(/\/+$/, '');
    if (baseTrimmed.endsWith('/api') && cleanedEndpoint.startsWith('api/')) {
      cleanedEndpoint = cleanedEndpoint.slice(4);
    }
    url = `${baseTrimmed}/${cleanedEndpoint}`;
  }

  const headers = new Headers(options.headers || {});

  // 1. Attach Authorization header if access token exists
  if (!options.skipAuth && !headers.has('Authorization')) {
    const { accessToken } = await getStoredTokens();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  // 2. Default to JSON content type only if body is NOT FormData
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  // 3. Automatic 401 retry via silent refresh
  if (response.status === 401 && !options.skipAuth) {
    const { refreshToken } = await getStoredTokens();
    if (refreshToken) {
      const newAccessToken = await refreshAuthToken(refreshToken);
      if (newAccessToken) {
        headers.set('Authorization', `Bearer ${newAccessToken}`);
        response = await fetch(url, {
          ...options,
          headers,
        });
      }
    }
  }

  return response;
}

/**
 * Convenience methods for JSON requests
 */
export const apiClient = {
  fetch: apiFetch,

  get: async <T = any>(endpoint: string, options?: ApiFetchOptions): Promise<T> => {
    const res = await apiFetch(endpoint, { ...options, method: 'GET' });
    if (!res.ok) {
      throw new Error(`GET ${endpoint} failed with status ${res.status}`);
    }
    return res.json();
  },

  post: async <T = any>(endpoint: string, data?: any, options?: ApiFetchOptions): Promise<T> => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    const res = await apiFetch(endpoint, {
      ...options,
      method: 'POST',
      body: isFormData ? data : data !== undefined ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) {
      throw new Error(`POST ${endpoint} failed with status ${res.status}`);
    }
    return res.json();
  },

  put: async <T = any>(endpoint: string, data?: any, options?: ApiFetchOptions): Promise<T> => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    const res = await apiFetch(endpoint, {
      ...options,
      method: 'PUT',
      body: isFormData ? data : data !== undefined ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) {
      throw new Error(`PUT ${endpoint} failed with status ${res.status}`);
    }
    return res.json();
  },

  delete: async <T = any>(endpoint: string, options?: ApiFetchOptions): Promise<T> => {
    const res = await apiFetch(endpoint, { ...options, method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`DELETE ${endpoint} failed with status ${res.status}`);
    }
    return res.json();
  },
};

