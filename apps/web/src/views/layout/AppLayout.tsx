import { clsx } from 'clsx';
import { LayoutDashboard, CheckSquare, GitBranch, Bell, ChevronLeft, LogOut, Table2 } from 'lucide-react';

type SidebarPanel = 'workflows' | 'approvals' | 'entities' | 'notifications' | null;

const NAV_ITEMS: { panel: SidebarPanel; icon: React.ReactNode; label: string }[] = [
  { panel: 'workflows',     icon: <GitBranch size={18} />,       label: 'Workflows' },
  { panel: 'approvals',     icon: <CheckSquare size={18} />,     label: 'Approvals' },
  { panel: 'entities',      icon: <LayoutDashboard size={18} />, label: 'Entities' },
  { panel: 'notifications', icon: <Bell size={18} />,            label: 'Alerts' },
];

interface Props {
  activePanel: SidebarPanel;
  isCollapsed: boolean;
  pendingApprovalCount: number;
  user: { name: string; role: string; tenantName: string } | null;
  sidebarContent: React.ReactNode;
  onPanelChange: (panel: SidebarPanel) => void;
  onToggleCollapse: () => void;
  onSignOut: () => void;
  onOpenSchemaBuilder?: () => void;
  children: React.ReactNode;
}

export function AppLayout({
  activePanel,
  isCollapsed,
  pendingApprovalCount,
  user,
  sidebarContent,
  onPanelChange,
  onToggleCollapse,
  onSignOut,
  onOpenSchemaBuilder,
  children,
}: Props) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className={clsx(
        'flex flex-col bg-white border-r border-gray-200 transition-all duration-200',
        isCollapsed ? 'w-14' : 'w-72'
      )}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">O</span>
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">Ops Platform</p>
              <p className="text-xs text-gray-400 truncate">{user?.tenantName}</p>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-1 px-2 py-3 border-b border-gray-100">
          {NAV_ITEMS.map(({ panel, icon, label }) => (
            <button
              key={panel}
              onClick={() => onPanelChange(activePanel === panel ? null : panel)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative',
                activePanel === panel ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <span className="shrink-0">{icon}</span>
              {!isCollapsed && <span className="truncate">{label}</span>}
              {panel === 'approvals' && pendingApprovalCount > 0 && (
                <span className={clsx(
                  'absolute bg-red-500 text-white text-xs rounded-full flex items-center justify-center',
                  isCollapsed ? 'top-1 right-1 w-4 h-4' : 'right-3 w-5 h-5'
                )}>
                  {pendingApprovalCount > 9 ? '9+' : pendingApprovalCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {onOpenSchemaBuilder && (
          <nav className="flex flex-col gap-1 px-2 py-3 border-b border-gray-100">
            {!isCollapsed && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 pb-1">Admin</p>
            )}
            <button
              onClick={onOpenSchemaBuilder}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              title="Schema Builder"
            >
              <span className="shrink-0"><Table2 size={18} /></span>
              {!isCollapsed && <span className="truncate">Schema Builder</span>}
            </button>
          </nav>
        )}

        {!isCollapsed && activePanel && (
          <div className="flex-1 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-3 pb-1">
              {NAV_ITEMS.find((n) => n.panel === activePanel)?.label}
            </p>
            {sidebarContent}
          </div>
        )}

        <div className={clsx('mt-auto px-2 py-3 border-t border-gray-100 flex', isCollapsed ? 'flex-col gap-2' : 'items-center justify-between')}>
          {!isCollapsed && user && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-400 capitalize">{user.role.replace(/_/g, ' ')}</p>
              </div>
            </div>
          )}
          <div className="flex gap-1">
            <button onClick={onSignOut} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Sign out">
              <LogOut size={16} />
            </button>
            <button onClick={onToggleCollapse} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <ChevronLeft size={16} className={clsx('transition-transform', isCollapsed && 'rotate-180')} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
