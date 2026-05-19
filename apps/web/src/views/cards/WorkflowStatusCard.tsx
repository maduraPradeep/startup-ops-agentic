import { useState } from 'react';
import { format } from 'date-fns';
import type { Workflow } from '@ops/shared';

interface Props {
  workflow: Workflow | null;
  isLoading: boolean;
  onCancel?: () => void;
  onViewDetails?: () => void;
}

const STATE_LABELS: Record<string, string> = {
  initiated:         '✅ Intent parsed',
  collecting_info:   '✅ Collecting information',
  validating:        '✅ Validating eligibility',
  awaiting_approval: '🔄 Awaiting approval...',
  escalated:         '⚠️ Escalated',
  approved:          '✅ Approved',
  rejected:          '❌ Rejected',
  completed:         '✅ Completed',
};

export function WorkflowStatusCard({ workflow, isLoading, onCancel, onViewDetails }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (isLoading || !workflow) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;
  }

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails();
    } else {
      setShowDetails((prev) => !prev);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm max-w-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔄</span>
        <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
      </div>

      <div className="h-2 bg-gray-100 rounded-full mb-4">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${workflow.progress}%` }}
        />
      </div>

      <ol className="space-y-1.5 mb-4">
        {Object.entries(STATE_LABELS).map(([state, label]) => {
          const historyItem = workflow.history.find((h) => h.state === state as any);
          const isCurrent   = workflow.current_state === state;
          const isPast      = historyItem && !isCurrent;
          return (
            <li
              key={state}
              className={`text-sm ${isPast ? 'text-gray-500' : isCurrent ? 'text-indigo-600 font-medium' : 'text-gray-300'}`}
            >
              {label}
            </li>
          );
        })}
      </ol>

      <div className="flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-red-600 border border-red-200 rounded px-3 py-1 hover:bg-red-50"
          >
            Cancel Workflow
          </button>
        )}
        <button
          onClick={handleViewDetails}
          className="text-xs text-indigo-600 border border-indigo-200 rounded px-3 py-1 hover:bg-indigo-50"
        >
          {showDetails ? 'Hide Details' : 'View Details'}
        </button>
      </div>

      {showDetails && !onViewDetails && (
        <div className="mt-4 border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">History</p>
          {workflow.history.length === 0 ? (
            <p className="text-xs text-gray-400">No history available.</p>
          ) : (
            workflow.history.map((entry, i) => (
              <div key={i} className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium capitalize">{(entry.state as string).replace(/_/g, ' ')}</span>
                  {entry.timestamp && (
                    <span className="text-gray-400">
                      {format(new Date(entry.timestamp), 'MMM d, HH:mm')}
                    </span>
                  )}
                </div>
                {(entry as any).agent_notes && (
                  <p className="text-gray-500">{(entry as any).agent_notes}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
