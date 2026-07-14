import { useApproveLeaveRequest, useRejectLeaveRequest, useUpdateLeaveRequest } from '../queries/useLeaveRequests';
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
  const reject = useRejectLeaveRequest();
  const update = useUpdateLeaveRequest();

  const handleReject = (id: string) => {
    const notes = window.prompt('Please provide a reason for rejection (optional):');
    if (notes !== null) {
      reject.mutate({ id, notes });
    }
  };

  return (
    <ApprovalCard
      action={action}
      isPending={approve.isPending || reject.isPending || update.isPending}
      onApprove={(id) => approve.mutate({ id })}
      onReject={handleReject}
      onModify={(id) => {
        const notes = window.prompt('Enter modifications or notes:');
        if (notes) {
          update.mutate({ id, data: { reason: notes } });
        }
      }}
    />
  );
}
