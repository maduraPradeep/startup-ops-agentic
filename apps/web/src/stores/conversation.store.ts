import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Message } from '@ops/shared';

interface ConversationState {
  conversationId: string | null;
  messages: Message[];
  isTyping: boolean;
  activeAgents: string[];
  setConversationId: (id: string) => void;
  appendMessage: (message: Message) => void;
  setTyping: (agent: string, typing: boolean) => void;
  clearConversation: () => void;
}

export const useConversationStore = create<ConversationState>()(
  devtools(
    (set) => ({
      conversationId: null,
      messages: [],
      isTyping: false,
      activeAgents: [],

      setConversationId: (id) => set({ conversationId: id }),

      appendMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

      setTyping: (agent, typing) =>
        set((state) => ({
          isTyping: typing,
          activeAgents: typing
            ? [...new Set([...state.activeAgents, agent])]
            : state.activeAgents.filter((a) => a !== agent),
        })),

      clearConversation: () =>
        set({ messages: [], conversationId: null, isTyping: false, activeAgents: [] }),
    }),
    { name: 'conversation' }
  )
);
