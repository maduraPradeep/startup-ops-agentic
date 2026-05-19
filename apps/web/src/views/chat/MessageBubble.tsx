import { clsx } from 'clsx';
import { format } from 'date-fns';
import type { Message } from '@ops/shared';
import { WorkflowStatusController } from '../../controllers/WorkflowStatusController';
import { ApprovalController } from '../../controllers/ApprovalController';
import { ActionCard } from '../cards/ActionCard';
import { BroadcastCard } from '../cards/BroadcastCard';

interface Props {
  message: Message;
  sendMessage?: (conversationId: string, content: string) => void;
}

const AGENT_COLORS: Record<string, string> = {
  intake:       'bg-blue-100 text-blue-800',
  orchestrator: 'bg-purple-100 text-purple-800',
  policy:       'bg-yellow-100 text-yellow-800',
  hr:           'bg-green-100 text-green-800',
  project:      'bg-orange-100 text-orange-800',
  finance:      'bg-teal-100 text-teal-800',
  notification: 'bg-gray-100 text-gray-800',
};

export function MessageBubble({ message, sendMessage }: Props) {
  const isHuman  = message.sender.type === 'human';
  const timestamp = message.timestamp ? format(new Date(message.timestamp), 'HH:mm') : '';

  return (
    <div className={clsx('flex gap-3', isHuman && 'flex-row-reverse')}>
      {!isHuman && (
        <div className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
          AGENT_COLORS[message.sender.id] ?? 'bg-gray-100 text-gray-800'
        )}>
          {message.sender.name.slice(0, 2).toUpperCase()}
        </div>
      )}

      <div className={clsx('max-w-[70%] space-y-2', isHuman && 'items-end')}>
        {!isHuman && (
          <p className="text-xs text-gray-500 font-medium">{message.sender.name}</p>
        )}

        <div className={clsx(
          'rounded-2xl px-4 py-3 text-sm',
          isHuman
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-900 rounded-tl-sm shadow-sm'
        )}>
          {message.content}
        </div>

        {message.payload?.type === 'workflow_status' && (
          <WorkflowStatusController workflowId={(message.payload.workflow as any)?.workflow_id} />
        )}

        {message.payload?.type === 'approval' && (
          <ApprovalController action={message.payload.approval as any} />
        )}

        {message.payload?.type === 'action_card' && (
          <ActionCard
            title={(message.payload as any).title ?? ''}
            description={(message.payload as any).description}
            actions={(message.payload as any).actions ?? []}
            onSelect={(value) => sendMessage?.(message.conversationId, value)}
          />
        )}

        {message.payload?.type === 'broadcast' && (
          <BroadcastCard broadcast={(message.payload as any).broadcast} />
        )}

        {timestamp && (
          <p className={clsx('text-xs text-gray-400', isHuman && 'text-right')}>
            {timestamp}
          </p>
        )}
      </div>
    </div>
  );
}
