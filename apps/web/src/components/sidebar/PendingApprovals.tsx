import { usePendingApprovals, useDecideApproval } from '../../queries/useApprovals';

export function PendingApprovals() {
  const { data, isLoading } = usePendingApprovals();
  const decide = useDecideApproval();
  const approvals = (data?.data ?? []) as any[];

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        No pending approvals
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {approvals.map((approval: any) => (
        <div key={approval.id} className="p-3 border border-amber-200 bg-amber-50 rounded-lg">
          <p className="text-sm font-medium text-gray-900 mb-1">{approval.title ?? 'Approval Required'}</p>
          <p className="text-xs text-gray-500 mb-2">{approval.description}</p>
          <div className="flex gap-1">
            <button
              onClick={() => decide.mutate({ id: approval.id, decision: 'rejected' })}
              className="flex-1 text-xs border border-red-200 text-red-600 rounded py-1 hover:bg-red-50"
            >
              Reject
            </button>
            <button
              onClick={() => decide.mutate({ id: approval.id, decision: 'approved' })}
              disabled={decide.isPending}
              className="flex-1 text-xs bg-green-600 text-white rounded py-1 hover:bg-green-700 disabled:opacity-50"
            >
              Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
