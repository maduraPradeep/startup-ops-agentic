import { useAuthStore } from '../stores/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';

type RequestOptions = {
  params?: Record<string, unknown>;
  signal?: AbortSignal;
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const { token } = useAuthStore.getState();

  const url = new URL(`${BASE_URL}${path}`);
  if (options?.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

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
