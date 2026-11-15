import { apiFetch } from './apiClient';

export interface RegisterRequest {
  userData: {
    userName: string;
    emailId: string;
    hashedPassword: string;
  };
}

export interface LoginRequest {
  emailId: string;
  password: string;
}

export interface AuthResponsePayload {
  userId?: string;
  userName?: string;
  emailId?: string;
  email?: string;
  role?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string | Record<string, string[]>;
  accessToken: string;
  refreshToken: string;
  payload: AuthResponsePayload;
}

/**
 * Register a new user with { userData: { userName, emailId, hashedPassword } }
 */
export async function registerUser(data: RegisterRequest): Promise<AuthResponse> {
  const response = await apiFetch('api/auth/register', {
    method: 'POST',
    skipAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const resJson = await response.json();

  if (!response.ok || !resJson.success) {
    const errorMsg =
      typeof resJson.message === 'string'
        ? resJson.message
        : resJson.message
        ? Object.values(resJson.message).flat().join(', ')
        : 'Registration failed';
    throw new Error(errorMsg);
  }

  return resJson as AuthResponse;
}

/**
 * Login an existing user with { emailId, password }
 */
export async function loginUser(data: LoginRequest): Promise<AuthResponse> {
  const response = await apiFetch('api/auth/login', {
    method: 'POST',
    skipAuth: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const resJson = await response.json();

  if (!response.ok || !resJson.success) {
    const errorMsg =
      typeof resJson.message === 'string'
        ? resJson.message
        : resJson.message
        ? Object.values(resJson.message).flat().join(', ')
        : 'Invalid credentials or login failed';
    throw new Error(errorMsg);
  }

  return resJson as AuthResponse;
}

