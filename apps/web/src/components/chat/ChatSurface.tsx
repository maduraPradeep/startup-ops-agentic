import { useRef, useEffect } from 'react';
import { useConversationStore } from '../../stores/conversation.store';
import { useConversationSocket } from '../../queries/useConversation';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';

export function ChatSurface() {
  const { messages, isTyping, activeAgents, conversationId } = useConversationStore();
  const { sendMessage } = useConversationSocket();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = (content: string) => {
    if (!conversationId) return;
    sendMessage(conversationId, content);
  };

  return (
    <div className="flex flex-col h-full">
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
          <MessageBubble key={msg.id ?? i} message={msg} />
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
        <MessageInput onSend={handleSend} disabled={!conversationId} />
      </div>
    </div>
  );
}
