import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        token: null,
        isAuthenticated: false,
        setAuth: (user, token) => set({ user, token, isAuthenticated: true }),
        clearAuth: () => set({ user: null, token: null, isAuthenticated: false }),
      }),
      {
        name: 'ops-auth',
        // Only persist the fields needed to restore session
        partialize: (state) => ({
          user:            state.user,
          token:           state.token,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    { name: 'auth' }
  )
);
