import { useApproveLeaveRequest } from '../queries/useLeaveRequests';
import { ApprovalCard } from '../views/cards/ApprovalCard';

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

interface Props {
  action: ApprovalAction;
}

export function ApprovalController({ action }: Props) {
  const approve = useApproveLeaveRequest();

  return (
    <ApprovalCard
      action={action}
      isPending={approve.isPending}
      onApprove={(id) => approve.mutate({ id })}
      onReject={(_id) => { /* TODO: wire reject mutation */ }}
    />
  );
}
