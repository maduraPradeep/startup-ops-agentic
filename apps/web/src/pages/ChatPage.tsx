import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppLayout } from '../components/layout/AppLayout';
import { ChatSurface } from '../components/chat/ChatSurface';
import { useConversationStore } from '../stores/conversation.store';

export function ChatPage() {
  const { conversationId, setConversationId } = useConversationStore();

  useEffect(() => {
    if (!conversationId) {
      setConversationId(uuidv4());
    }
  }, [conversationId, setConversationId]);

  return (
    <AppLayout>
      <ChatSurface />
    </AppLayout>
  );
}
