import { useSidebarStore } from '../stores/sidebar.store';
import { useAuthStore } from '../stores/auth.store';
import { AppLayout } from '../views/layout/AppLayout';
import { ActiveWorkflowsController } from './ActiveWorkflowsController';
import { PendingApprovalsController } from './PendingApprovalsController';
import { RecentEntitiesController } from './RecentEntitiesController';

type SidebarPanel = 'workflows' | 'approvals' | 'entities' | 'notifications' | null;

interface Props {
  children: React.ReactNode;
  onNavigateWorkflowBuilder?: () => void;
}

function resolveSidebarContent(panel: SidebarPanel) {
  switch (panel) {
    case 'workflows':     return <ActiveWorkflowsController />;
    case 'approvals':     return <PendingApprovalsController />;
    case 'entities':      return <RecentEntitiesController />;
    case 'notifications': return <p className="text-sm text-gray-400 px-4 py-3">No new notifications</p>;
    default:              return null;
  }
}

export function AppController({ children, onNavigateWorkflowBuilder }: Props) {
  const {
    activePanel, isCollapsed, pendingApprovalCount,
    setActivePanel, toggleCollapse, setPendingCount,
  } = useSidebarStore();
  const { user, clearAuth } = useAuthStore();

  // setPendingCount is fed by the PendingApprovalsController via useApprovals hook
  void setPendingCount;

  return (
    <AppLayout
      activePanel={activePanel}
      isCollapsed={isCollapsed}
      pendingApprovalCount={pendingApprovalCount}
      user={user}
      sidebarContent={resolveSidebarContent(activePanel)}
      onPanelChange={setActivePanel}
      onNavigateWorkflowBuilder={onNavigateWorkflowBuilder}
      onToggleCollapse={toggleCollapse}
      onSignOut={clearAuth}
    >
      {children}
    </AppLayout>
  );
}
