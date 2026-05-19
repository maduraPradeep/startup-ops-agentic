import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AppController } from '../controllers/AppController';
import { ChatController } from '../controllers/ChatController';
import { useConversationStore } from '../stores/conversation.store';

interface Props {
  onNavigateWorkflowBuilder?: () => void;
  onNavigateAdmin?: () => void;
}

export function ChatPage({ onNavigateWorkflowBuilder, onNavigateAdmin }: Props) {
  const { conversationId, setConversationId } = useConversationStore();

  useEffect(() => {
    if (!conversationId) setConversationId(uuidv4());
  }, [conversationId, setConversationId]);

  return (
    <AppController
      onNavigateWorkflowBuilder={onNavigateWorkflowBuilder}
      onNavigateAdmin={onNavigateAdmin}
    >
      <ChatController />
    </AppController>
  );
}
