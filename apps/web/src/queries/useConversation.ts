import { useEffect, useRef, useState } from 'react';
import { useConversationStore } from '../stores/conversation.store';
import { useAuthStore } from '../stores/auth.store';
import type { Message } from '@ops/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useConversationSocket() {
  const { appendMessage, setTyping } = useConversationStore();
  const { user, token } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayIndexRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    if (!token || !user) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;

      setConnectionStatus('connecting');

      const wsUrl = (import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001')
        .replace(/^http/, 'ws');
      const ws = new WebSocket(`${wsUrl}/api/v1/conversations/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnectionStatus('connected');
        reconnectDelayIndexRef.current = 0;
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as { type: string; data: unknown };
        if (data.type === 'message') {
          appendMessage(data.data as Message);
        } else if (data.type === 'agent:typing') {
          const { agent, typing } = data.data as { agent: string; typing: boolean };
          setTyping(agent, typing);
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnectionStatus('disconnected');
        wsRef.current = null;

        // Exponential backoff reconnect
        const delayIndex = Math.min(
          reconnectDelayIndexRef.current,
          RECONNECT_DELAYS.length - 1
        );
        const delay = RECONNECT_DELAYS[delayIndex];
        reconnectDelayIndexRef.current = delayIndex + 1;

        reconnectTimerRef.current = setTimeout(() => {
          if (!cancelled) connect();
        }, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, user, appendMessage, setTyping]);

  const sendMessage = (conversationId: string, content: string) => {
    // Optimistically append the user's own message (Task 13)
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      const optimisticMessage: Message = {
        id: crypto.randomUUID(),
        conversationId,
        content,
        timestamp: new Date(),
        sender: {
          type: 'human',
          id: currentUser.id,
          name: currentUser.name,
          avatar: undefined,
          color: undefined,
        },
        payload: undefined,
      };
      appendMessage(optimisticMessage);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ conversationId, content, channel: 'webchat' }));
    }
  };

  return { sendMessage, connectionStatus };
}
