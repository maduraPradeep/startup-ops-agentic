import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// Phase 1b — there is no react-router (App.tsx switches Login vs Chat on auth).
// Per UI-DESIGN.md principle 4, admin surfaces (Schema Builder, Skill Editor) are full-page
// overlays reachable from the sidebar that do NOT disrupt the chat context. This tiny store
// tracks which overlay (if any) is open; the AppController renders the overlay above the chat
// and the sidebar opens it. Mirrors the shape of sidebar.store.ts.
//
// Not persisted: an overlay should not survive a reload (the operator lands back on chat).

export type AdminSurface = 'schema-builder' | 'skill-editor' | null;

interface AdminSurfaceState {
  surface: AdminSurface;
  openSurface: (surface: AdminSurface) => void;
  closeSurface: () => void;
}

export const useAdminSurfaceStore = create<AdminSurfaceState>()(
  devtools(
    (set) => ({
      surface: null,
      openSurface: (surface) => set({ surface }),
      closeSurface: () => set({ surface: null }),
    }),
    { name: 'admin-surface' }
  )
);
