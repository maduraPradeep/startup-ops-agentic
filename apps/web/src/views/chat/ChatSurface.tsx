import { useRef, useEffect } from 'react';
import type { Message } from '@ops/shared';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import type { ConnectionStatus } from '../../queries/useConversation';

interface Props {
  messages: Message[];
  isTyping: boolean;
  activeAgents: string[];
  disabled: boolean;
  onSend: (content: string) => void;
  connectionStatus?: ConnectionStatus;
  sendMessage?: (conversationId: string, content: string) => void;
  conversationId?: string | null;
}

function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;

  const isError = status === 'error';
  const label =
    status === 'connecting'
      ? 'Connecting…'
      : isError
        ? 'Connection error — reconnecting…'
        : 'Connection lost — reconnecting…';

  return (
    <div
      className={`px-4 py-2 text-sm font-medium text-center ${
        isError ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      {label}
    </div>
  );
}

export function ChatSurface({
  messages,
  isTyping,
  activeAgents,
  disabled,
  onSend,
  connectionStatus,
  sendMessage,
  conversationId,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col h-full">
      {connectionStatus && <ConnectionBanner status={connectionStatus} />}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-lg font-medium">How can I help you today?</p>
              <p className="text-sm mt-1">Ask about employees, leave requests, workflows, and more.</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id ?? i}
            message={msg}
            sendMessage={
              sendMessage && conversationId
                ? (content) => sendMessage(conversationId, content)
                : undefined
            }
          />
        ))}
        {isTyping && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{activeAgents[0] ?? 'Agent'} is typing…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-gray-200 p-4">
        <MessageInput onSend={onSend} disabled={disabled} />
      </div>
    </div>
  );
}
