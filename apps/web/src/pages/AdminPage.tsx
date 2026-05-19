import { useState } from 'react';
import { Database, ArrowLeft } from 'lucide-react';
import { EntityDataTable, type CollectionConfig } from '../views/admin/EntityDataTable';
import { EntityFormModal, type FormCollectionConfig } from '../views/admin/EntityFormModal';
import { usePermissions } from '../hooks/usePermissions';

interface Props {
  onBack?: () => void;
}

// ── Collection definitions ──────────────────────────────────────────────────

const COLLECTIONS: FormCollectionConfig[] = [
  {
    name: 'employees',
    label: 'Employees',
    readPermission: 'employees:read',
    createPermission: 'employees:create',
    updatePermission: 'employees:update',
    columns: [
      { key: 'name',              label: 'Name' },
      { key: 'email',             label: 'Email' },
      { key: 'role',              label: 'Role' },
      { key: 'department',        label: 'Department' },
      { key: 'employment_status', label: 'Status', render: (v) => statusBadge(String(v ?? '')) },
      { key: 'employment_type',   label: 'Type' },
      { key: 'start_date',        label: 'Start Date' },
    ],
    fields: [
      { key: 'name',             label: 'Full Name',        type: 'text',  required: true },
      { key: 'email',            label: 'Email',            type: 'email', required: true },
      { key: 'role',             label: 'Role',             type: 'text',  required: true },
      { key: 'department',       label: 'Department ID',    type: 'text',  required: true },
      { key: 'start_date',       label: 'Start Date',       type: 'date',  required: true },
      { key: 'location',         label: 'Location',         type: 'text' },
      {
        key: 'employment_status', label: 'Employment Status', type: 'select',
        options: [
          { label: 'Active',     value: 'active' },
          { label: 'On Leave',   value: 'on_leave' },
          { label: 'Suspended',  value: 'suspended' },
          { label: 'Terminated', value: 'terminated' },
        ],
      },
      {
        key: 'employment_type', label: 'Employment Type', type: 'select',
        options: [
          { label: 'Full Time',   value: 'full_time' },
          { label: 'Part Time',   value: 'part_time' },
          { label: 'Contractor',  value: 'contractor' },
          { label: 'Intern',      value: 'intern' },
        ],
      },
    ],
    defaultValues: { employment_status: 'active', employment_type: 'full_time' },
  },
  {
    name: 'leave_requests',
    label: 'Leave Requests',
    readPermission: 'leave_requests:read',
    updatePermission: 'leave_requests:approve',
    readOnly: false,
    columns: [
      { key: 'employee_id',  label: 'Employee' },
      { key: 'leave_type',   label: 'Type' },
      { key: 'start_date',   label: 'Start' },
      { key: 'end_date',     label: 'End' },
      { key: 'status',       label: 'Status', render: (v) => statusBadge(String(v ?? '')) },
      { key: 'reason',       label: 'Reason' },
      { key: 'created_at',   label: 'Submitted' },
    ],
    fields: [
      { key: 'employee_id', label: 'Employee ID',  type: 'text',     required: true },
      { key: 'leave_type',  label: 'Leave Type',   type: 'text',     required: true },
      { key: 'start_date',  label: 'Start Date',   type: 'date',     required: true },
      { key: 'end_date',    label: 'End Date',     type: 'date',     required: true },
      { key: 'reason',      label: 'Reason',       type: 'textarea' },
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { label: 'Pending',  value: 'pending' },
          { label: 'Approved', value: 'approved' },
          { label: 'Rejected', value: 'rejected' },
        ],
      },
    ],
  },
  {
    name: 'leave_policies',
    label: 'Leave Policies',
    readPermission: 'leave_policies:read',
    createPermission: 'leave_policies:create',
    updatePermission: 'leave_policies:update',
    columns: [
      { key: 'name',             label: 'Name' },
      { key: 'leave_type',       label: 'Leave Type' },
      { key: 'max_days',         label: 'Max Days' },
      { key: 'min_days_notice',  label: 'Min Notice (days)' },
      { key: 'status',           label: 'Status', render: (v) => statusBadge(String(v ?? '')) },
    ],
    fields: [
      { key: 'name',            label: 'Policy Name',      type: 'text',  required: true },
      { key: 'leave_type',      label: 'Leave Type',       type: 'text',  required: true },
      { key: 'max_days',        label: 'Max Days',         type: 'text',  required: true },
      { key: 'min_days_notice', label: 'Min Days Notice',  type: 'text' },
      { key: 'blackout_dates',  label: 'Blackout Dates (JSON)', type: 'textarea' },
      {
        key: 'status', label: 'Status', type: 'select',
        options: [
          { label: 'Active',   value: 'active' },
          { label: 'Inactive', value: 'inactive' },
        ],
      },
    ],
    defaultValues: { status: 'active' },
  },
  {
    name: 'audit_logs',
    label: 'Audit Logs',
    readPermission: 'audit_logs:read',
    readOnly: true,
    columns: [
      { key: 'actor_email', label: 'Actor' },
      { key: 'action',      label: 'Action' },
      { key: 'collection',  label: 'Collection' },
      { key: 'item_id',     label: 'Item' },
      { key: 'timestamp',   label: 'Timestamp' },
    ],
    fields: [],
  },
];

// ── Status badge helper ────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-green-100 text-green-700',
  approved:   'bg-green-100 text-green-700',
  pending:    'bg-yellow-100 text-yellow-700',
  on_leave:   'bg-blue-100 text-blue-700',
  suspended:  'bg-orange-100 text-orange-700',
  rejected:   'bg-red-100 text-red-700',
  terminated: 'bg-gray-100 text-gray-600',
  inactive:   'bg-gray-100 text-gray-500',
};

function statusBadge(status: string) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage({ onBack }: Props) {
  const { can } = usePermissions();
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [formState, setFormState] = useState<{
    open: boolean;
    data?: Record<string, unknown> | null;
  }>({ open: false });

  const visibleCollections = COLLECTIONS.filter((c) => can(c.readPermission));

  const currentConfig = visibleCollections.find((c) => c.name === activeCollection)
    ?? visibleCollections[0];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Database size={20} className="text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">Data Admin</h1>
        </div>

        {/* Collection tabs */}
        <div className="flex gap-1 ml-6">
          {visibleCollections.map((col) => (
            <button
              key={col.name}
              onClick={() => setActiveCollection(col.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                (activeCollection ?? visibleCollections[0]?.name) === col.name
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {col.label}
            </button>
          ))}
        </div>
      </header>

      {/* Table */}
      <div className="flex-1 overflow-hidden p-6">
        {currentConfig ? (
          <EntityDataTable
            config={currentConfig}
            onAdd={() => setFormState({ open: true, data: null })}
            onEdit={(row) => setFormState({ open: true, data: row })}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            You don't have access to any data collections.
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {formState.open && currentConfig && currentConfig.fields.length > 0 && (
        <EntityFormModal
          config={currentConfig}
          initialData={formState.data}
          onClose={() => setFormState({ open: false })}
        />
      )}
    </div>
  );
}
