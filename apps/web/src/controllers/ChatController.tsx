import { useConversationStore } from '../stores/conversation.store';
import { useConversationSocket } from '../queries/useConversation';
import { ChatSurface } from '../views/chat/ChatSurface';

export function ChatController() {
  const { messages, isTyping, activeAgents, conversationId } = useConversationStore();
  const { sendMessage, connectionStatus } = useConversationSocket();

  const handleSend = (content: string) => {
    if (conversationId) sendMessage(conversationId, content);
  };

  return (
    <ChatSurface
      messages={messages}
      isTyping={isTyping}
      activeAgents={activeAgents}
      disabled={!conversationId}
      onSend={handleSend}
      connectionStatus={connectionStatus}
      sendMessage={sendMessage}
    />
  );
}
