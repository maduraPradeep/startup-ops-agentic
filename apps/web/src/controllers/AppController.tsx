import { useState, useEffect, useCallback } from 'react';
import { useSidebarStore } from '../stores/sidebar.store';
import { useAuthStore } from '../stores/auth.store';
import { AppLayout } from '../views/layout/AppLayout';
import { ActiveWorkflowsController } from './ActiveWorkflowsController';
import { PendingApprovalsController } from './PendingApprovalsController';
import { RecentEntitiesController } from './RecentEntitiesController';
import { getSocket } from '../lib/socket';
import { useBroadcast } from '../queries/useBroadcast';
import type { BroadcastPayload } from '../queries/useBroadcast';
import { format } from 'date-fns';

type SidebarPanel = 'workflows' | 'approvals' | 'entities' | 'notifications' | null;

interface Notification {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface Props {
  children: React.ReactNode;
  onNavigateWorkflowBuilder?: () => void;
  onNavigateAdmin?: () => void;
}

function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showCompose, setShowCompose] = useState(false);
  const { sendBroadcast } = useBroadcast();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<BroadcastPayload['audience']>('all');
  const [priority, setPriority] = useState<BroadcastPayload['priority']>('normal');
  const [channels, setChannels] = useState<Array<'webchat' | 'email' | 'sms'>>(['webchat']);

  const addNotification = useCallback((type: string, msg: string) => {
    setNotifications((prev) => [
      {
        id: crypto.randomUUID(),
        type,
        message: msg,
        timestamp: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleApprovalDecided = (data: any) => {
      addNotification('approval:decided', `Approval decision: ${data?.decision ?? 'unknown'}`);
    };
    const handleBroadcastNew = (data: any) => {
      addNotification('broadcast:new', `New broadcast: ${data?.title ?? 'Untitled'}`);
    };
    const handleWorkflowUpdated = (data: any) => {
      addNotification('workflow:updated', `Workflow updated: ${data?.name ?? data?.id ?? 'unknown'}`);
    };

    socket.on('approval:decided', handleApprovalDecided);
    socket.on('broadcast:new', handleBroadcastNew);
    socket.on('workflow:updated', handleWorkflowUpdated);

    return () => {
      socket.off('approval:decided', handleApprovalDecided);
      socket.off('broadcast:new', handleBroadcastNew);
      socket.off('workflow:updated', handleWorkflowUpdated);
    };
  }, [addNotification]);

  const toggleChannel = (ch: 'webchat' | 'email' | 'sms') => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSend = () => {
    if (!title || !message || channels.length === 0) return;
    sendBroadcast.mutate(
      { title, message, audience, priority, channels },
      {
        onSuccess: () => {
          setTitle('');
          setMessage('');
          setAudience('all');
          setPriority('normal');
          setChannels(['webchat']);
          setShowCompose(false);
          addNotification('broadcast:new', `New broadcast: ${title}`);
        },
      }
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Notifications {notifications.length > 0 && `(${notifications.length})`}
        </span>
        <div className="flex gap-2">
          {notifications.length > 0 && (
            <button
              onClick={() => setNotifications([])}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={() => setShowCompose((s) => !s)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            {showCompose ? 'Cancel' : 'Send Broadcast'}
          </button>
        </div>
      </div>

      {showCompose && (
        <div className="border-b border-gray-100 p-4 space-y-3 bg-gray-50">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Compose Broadcast</h3>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Broadcast title"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your message..."
              rows={3}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as BroadcastPayload['audience'])}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none"
              >
                <option value="all">All</option>
                <option value="department">Department</option>
                <option value="role">Role</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as BroadcastPayload['priority'])}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg outline-none"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Channels</label>
            <div className="flex gap-3">
              {(['webchat', 'email', 'sms'] as const).map((ch) => (
                <label key={ch} className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={channels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                    className="rounded"
                  />
                  {ch}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={sendBroadcast.isPending || !title || !message || channels.length === 0}
            className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {sendBroadcast.isPending ? 'Sending...' : 'Send'}
          </button>

          {sendBroadcast.isError && (
            <p className="text-xs text-red-600">
              Failed: {(sendBroadcast.error as any)?.message ?? 'Unknown error'}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-3">No new notifications</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <li key={n.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                <p className="text-sm text-gray-800">{n.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {format(new Date(n.timestamp), 'MMM d, HH:mm')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function resolveSidebarContent(panel: SidebarPanel) {
  switch (panel) {
    case 'workflows':     return <ActiveWorkflowsController />;
    case 'approvals':     return <PendingApprovalsController />;
    case 'entities':      return <RecentEntitiesController />;
    case 'notifications': return <NotificationsPanel />;
    default:              return null;
  }
}

export function AppController({ children, onNavigateWorkflowBuilder, onNavigateAdmin }: Props) {
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
      onNavigateAdmin={onNavigateAdmin}
      onToggleCollapse={toggleCollapse}
      onSignOut={clearAuth}
    >
      {children}
    </AppLayout>
  );
}
