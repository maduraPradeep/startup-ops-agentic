import { useWorkflows } from '../../queries/useWorkflows';
import { clsx } from 'clsx';

const STATE_BADGE: Record<string, string> = {
  initiated:         'bg-blue-100 text-blue-700',
  collecting_info:   'bg-blue-100 text-blue-700',
  validating:        'bg-yellow-100 text-yellow-700',
  awaiting_approval: 'bg-amber-100 text-amber-700',
  escalated:         'bg-red-100 text-red-700',
  approved:          'bg-green-100 text-green-700',
  rejected:          'bg-red-100 text-red-700',
  completed:         'bg-green-100 text-green-700',
  error:             'bg-red-100 text-red-700',
};

export function ActiveWorkflows() {
  const { data, isLoading } = useWorkflows();
  const workflows = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        No active workflows
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {workflows.map((wf) => (
        <div key={wf.workflow_id} className="p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-gray-900 truncate">{wf.name}</p>
            <span className={clsx('text-xs px-2 py-0.5 rounded-full', STATE_BADGE[wf.current_state] ?? 'bg-gray-100 text-gray-600')}>
              {wf.current_state.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${wf.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
