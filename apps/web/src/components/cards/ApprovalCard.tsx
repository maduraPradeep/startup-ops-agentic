import { useApproveLeaveRequest } from '../../queries/useLeaveRequests';

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

export function ApprovalCard({ action }: Props) {
  const approve = useApproveLeaveRequest();

  return (
    <div className="border-l-4 border-amber-400 bg-amber-50 rounded-xl p-4 max-w-sm">
      <div className="flex items-center gap-2 mb-2">
        <span>🔒</span>
        <span className="font-semibold text-gray-900">Approval Required</span>
      </div>

      <p className="text-sm text-gray-700 mb-2">{action.description}</p>

      {action.impact && (
        <ul className="text-xs text-gray-500 mb-3 space-y-0.5">
          {action.impact.map((item, i) => (
            <li key={i}>• {item}</li>
          ))}
        </ul>
      )}

      {action.policyRef && (
        <p className="text-xs text-gray-400 mb-3">📋 {action.policyRef}</p>
      )}

      <div className="flex gap-2">
        <button className="flex-1 text-sm border border-red-300 text-red-600 rounded-lg py-1.5 hover:bg-red-50">
          ❌ Reject
        </button>
        <button className="flex-1 text-sm border border-gray-300 text-gray-600 rounded-lg py-1.5 hover:bg-gray-50">
          ✏️ Modify
        </button>
        <button
          onClick={() => approve.mutate({ id: action.id })}
          disabled={approve.isPending}
          className="flex-1 text-sm bg-green-600 text-white rounded-lg py-1.5 hover:bg-green-700 disabled:opacity-50"
        >
          ✅ {approve.isPending ? 'Approving…' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
