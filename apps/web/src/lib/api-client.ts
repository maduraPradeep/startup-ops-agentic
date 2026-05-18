import { useAuthStore } from '../stores/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

type RequestOptions = {
  params?: Record<string, unknown>;
  signal?: AbortSignal;
};

// Internal fetch helper — no refresh logic, used for the refresh call itself
async function rawRequest(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  options?: RequestOptions
): Promise<Response> {
  const url = new URL(`${BASE_URL}${path}`);
  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }

  return fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const { token } = useAuthStore.getState();

  let response = await rawRequest(method, path, body, token, options);

  // Attempt token refresh on 401 (only once to avoid infinite loops)
  if (response.status === 401) {
    const { refreshToken, setAuth, clearAuth } = useAuthStore.getState();

    if (refreshToken) {
      try {
        const refreshResponse = await rawRequest('POST', '/auth/refresh', { refreshToken });
        if (refreshResponse.ok) {
          const data = await refreshResponse.json() as {
            token: string;
            refreshToken: string;
            user: Parameters<typeof setAuth>[0];
          };
          setAuth(data.user, data.token, data.refreshToken);
          // Retry original request with new token
          response = await rawRequest(method, path, body, data.token, options);
        } else {
          clearAuth();
        }
      } catch {
        clearAuth();
      }
    } else {
      clearAuth();
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw Object.assign(new Error(error.error), { status: response.status, data: error });
  }

  return response.json();
}

export const apiClient = {
  get:    <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post:   <T>(path: string, body?: unknown)         => request<T>('POST', path, body),
  patch:  <T>(path: string, body?: unknown)         => request<T>('PATCH', path, body),
  delete: <T>(path: string)                         => request<T>('DELETE', path),
};
