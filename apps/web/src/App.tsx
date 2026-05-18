import { useState } from 'react';
import { useAuthStore } from './stores/auth.store';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { WorkflowBuilderPage } from './pages/WorkflowBuilderPage';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [currentPage, setCurrentPage] = useState<'chat' | 'workflow-builder'>('chat');

  if (!isAuthenticated) return <LoginPage />;

  return (
    <>
      {currentPage === 'chat' ? (
        <ChatPage onNavigateWorkflowBuilder={() => setCurrentPage('workflow-builder')} />
      ) : (
        <WorkflowBuilderPage onBack={() => setCurrentPage('chat')} />
      )}
    </>
  );
}
