import { directus } from '../services/directus.service.js';

export const ApprovalModel = {
  async findPending(tenantId: string, approverId: string) {
    return directus.readItems('approval_chains', {
      filter: {
        tenant_id: { _eq: tenantId },
        status:    { _eq: 'pending' },
        approver:  { _eq: approverId },
      },
      sort:  ['deadline'],
      limit: 50,
    });
  },

  async decide(
    id: string,
    decision: 'approved' | 'rejected',
    notes: string | undefined,
    decidedBy: string
  ) {
    return directus.updateItem('approval_chains', id, {
      status:         decision,
      approval_notes: notes,
      decided_at:     new Date().toISOString(),
      decided_by:     decidedBy,
    });
  },
};
