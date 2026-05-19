import { useState } from 'react';
import { useAuthStore } from './stores/auth.store';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { WorkflowBuilderPage } from './pages/WorkflowBuilderPage';
import { AdminPage } from './pages/AdminPage';
import { usePermissions } from './hooks/usePermissions';

type Page = 'chat' | 'workflow-builder' | 'admin';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { canAccessAdmin } = usePermissions();
  const [currentPage, setCurrentPage] = useState<Page>('chat');

  if (!isAuthenticated) return <LoginPage />;

  if (currentPage === 'workflow-builder')
    return <WorkflowBuilderPage onBack={() => setCurrentPage('chat')} />;

  if (currentPage === 'admin' && canAccessAdmin)
    return <AdminPage onBack={() => setCurrentPage('chat')} />;

  return (
    <ChatPage
      onNavigateWorkflowBuilder={() => setCurrentPage('workflow-builder')}
      onNavigateAdmin={canAccessAdmin ? () => setCurrentPage('admin') : undefined}
    />
  );
}
