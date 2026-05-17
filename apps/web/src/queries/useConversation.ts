import { useEffect, useRef } from 'react';
import { useConversationStore } from '../stores/conversation.store';
import { useAuthStore } from '../stores/auth.store';
import type { Message } from '@ops/shared';

export function useConversationSocket() {
  const { appendMessage, setTyping } = useConversationStore();
  const { user, token } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token || !user) return;

    const wsUrl = (import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001')
      .replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/api/v1/conversations/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type: string; data: unknown };
      if (data.type === 'message') {
        appendMessage(data.data as Message);
      } else if (data.type === 'agent:typing') {
        const { agent, typing } = data.data as { agent: string; typing: boolean };
        setTyping(agent, typing);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, user, appendMessage, setTyping]);

  const sendMessage = (conversationId: string, content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ conversationId, content, channel: 'webchat' }));
    }
  };

  return { sendMessage };
}
