import { clsx } from 'clsx';

interface Action {
  label: string;
  value: string;
  description?: string;
}

interface Props {
  title: string;
  description?: string;
  actions: Action[];
  onSelect: (value: string) => void;
}

export function ActionCard({ title, description, actions, onSelect }: Props) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm max-w-sm">
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 mb-3">{description}</p>
      )}
      <div className="flex flex-col gap-2">
        {actions.map((action) => (
          <button
            key={action.value}
            onClick={() => onSelect(action.value)}
            className={clsx(
              'text-left px-3 py-2 rounded-lg border text-sm transition-colors',
              'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
            )}
          >
            <span className="font-medium">{action.label}</span>
            {action.description && (
              <span className="block text-xs text-gray-500 mt-0.5">{action.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
