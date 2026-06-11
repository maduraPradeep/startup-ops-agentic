import { useSidebarStore } from '../stores/sidebar.store';
import { useAuthStore } from '../stores/auth.store';
import { useAdminSurfaceStore } from '../stores/admin-surface.store';
import { AppLayout } from '../views/layout/AppLayout';
import { ActiveWorkflowsController } from './ActiveWorkflowsController';
import { PendingApprovalsController } from './PendingApprovalsController';
import { RecentEntitiesController } from './RecentEntitiesController';
import { SchemaBuilderController } from './SchemaBuilderController';
import { SkillEditorController } from './SkillEditorController';

type SidebarPanel = 'workflows' | 'approvals' | 'entities' | 'notifications' | null;

interface Props { children: React.ReactNode }

function resolveSidebarContent(panel: SidebarPanel) {
  switch (panel) {
    case 'workflows':     return <ActiveWorkflowsController />;
    case 'approvals':     return <PendingApprovalsController />;
    case 'entities':      return <RecentEntitiesController />;
    case 'notifications': return <p className="text-sm text-gray-400 px-4 py-3">No new notifications</p>;
    default:              return null;
  }
}

export function AppController({ children }: Props) {
  const {
    activePanel, isCollapsed, pendingApprovalCount,
    setActivePanel, toggleCollapse, setPendingCount,
  } = useSidebarStore();
  const { user, clearAuth } = useAuthStore();
  const { surface, openSurface, closeSurface } = useAdminSurfaceStore();

  // setPendingCount is fed by the PendingApprovalsController via useApprovals hook
  void setPendingCount;

  return (
    <>
      <AppLayout
        activePanel={activePanel}
        isCollapsed={isCollapsed}
        pendingApprovalCount={pendingApprovalCount}
        user={user}
        sidebarContent={resolveSidebarContent(activePanel)}
        onPanelChange={setActivePanel}
        onToggleCollapse={toggleCollapse}
        onSignOut={clearAuth}
        onOpenSchemaBuilder={() => openSurface('schema-builder')}
        onOpenSkillEditor={() => openSurface('skill-editor')}
      >
        {children}
      </AppLayout>
      {surface === 'schema-builder' && <SchemaBuilderController onClose={closeSurface} />}
      {surface === 'skill-editor' && <SkillEditorController onClose={closeSurface} />}
    </>
  );
}
