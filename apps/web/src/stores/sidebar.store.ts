import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

type SidebarPanel = 'workflows' | 'approvals' | 'entities' | 'notifications' | null;

interface SidebarState {
  activePanel: SidebarPanel;
  isCollapsed: boolean;
  pendingApprovalCount: number;
  setActivePanel: (panel: SidebarPanel) => void;
  toggleCollapse: () => void;
  setPendingCount: (count: number) => void;
}

export const useSidebarStore = create<SidebarState>()(
  devtools(
    persist(
      (set) => ({
        activePanel: 'workflows',
        isCollapsed: false,
        pendingApprovalCount: 0,
        setActivePanel: (panel) => set({ activePanel: panel }),
        toggleCollapse: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
        setPendingCount: (count) => set({ pendingApprovalCount: count }),
      }),
      { name: 'sidebar-preferences' }
    ),
    { name: 'sidebar' }
  )
);
