import { clsx } from 'clsx';
import { format } from 'date-fns';

interface BroadcastMessage {
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  sentBy: { name: string };
  sentAt: string;
}

const PRIORITY_STYLES = {
  low:    'border-gray-300 bg-gray-50',
  normal: 'border-blue-300 bg-blue-50',
  high:   'border-orange-400 bg-orange-50',
  urgent: 'border-red-500 bg-red-50',
};

const PRIORITY_ICONS = {
  low: '📢',
  normal: '📣',
  high: '⚠️',
  urgent: '🚨',
};

interface Props {
  broadcast: BroadcastMessage;
}

export function BroadcastCard({ broadcast }: Props) {
  return (
    <div className={clsx('border-l-4 rounded-xl p-4 max-w-sm', PRIORITY_STYLES[broadcast.priority])}>
      <div className="flex items-center gap-2 mb-1">
        <span>{PRIORITY_ICONS[broadcast.priority]}</span>
        <span className="font-semibold text-gray-900 text-sm">{broadcast.title}</span>
      </div>
      <p className="text-sm text-gray-700 mb-2">{broadcast.message}</p>
      <p className="text-xs text-gray-400">
        From {broadcast.sentBy.name} · {format(new Date(broadcast.sentAt), 'MMM d, HH:mm')}
      </p>
    </div>
  );
}
