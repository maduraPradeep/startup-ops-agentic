import { usePendingApprovals, useDecideApproval } from '../queries/useApprovals';
import { PendingApprovals } from '../views/sidebar/PendingApprovals';

export function PendingApprovalsController() {
  const { data, isLoading } = usePendingApprovals();
  const decide = useDecideApproval();

  const approvals = (data?.data ?? []) as Array<{ id: string; title?: string; description?: string }>;

  return (
    <PendingApprovals
      approvals={approvals}
      isLoading={isLoading}
      isPending={decide.isPending}
      onApprove={(id) => decide.mutate({ id, decision: 'approved' })}
      onReject={(id)  => decide.mutate({ id, decision: 'rejected' })}
    />
  );
}
