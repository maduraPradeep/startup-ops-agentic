import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ApprovalAction {
  id: string;
  type: 'leave_request' | 'employee_action' | 'expense';
  title: string;
  description: string;
  requestedBy: string;
  policyRef?: string;
  impact?: string[];
  deadline?: Date;
}

interface ApprovalState {
  pendingApprovals: ApprovalAction[];
  addApproval: (approval: ApprovalAction) => void;
  removeApproval: (id: string) => void;
  clearApprovals: () => void;
}

export const useApprovalStore = create<ApprovalState>()(
  devtools(
    (set) => ({
      pendingApprovals: [],
      addApproval: (approval) =>
        set((state) => ({
          pendingApprovals: [...state.pendingApprovals, approval],
        })),
      removeApproval: (id) =>
        set((state) => ({
          pendingApprovals: state.pendingApprovals.filter((a) => a.id !== id),
        })),
      clearApprovals: () => set({ pendingApprovals: [] }),
    }),
    { name: 'approvals' }
  )
);
