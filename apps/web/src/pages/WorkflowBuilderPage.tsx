import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, GitBranch, MessageSquare, Calendar, Zap, Send, CheckCircle, Bell, Trash2, Edit2, List } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { ArrowLeft } from 'lucide-react';
import type { CreateWorkflowDefinition } from '@ops/shared';

interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  trigger: { type: 'message' | 'event' | 'schedule'; config: Record<string, unknown> };
  prompt: string;
  entities?: string[];
  output: { type: 'message' | 'task' | 'notification'; config: Record<string, unknown> };
  status: 'active' | 'inactive';
}

interface Props {
  onBack?: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
};

export function WorkflowBuilderPage({ onBack }: Props) {
  const queryClient = useQueryClient();

  // View mode: 'list' | 'form'
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'message' | 'event' | 'schedule'>('message');
  const [prompt, setPrompt] = useState('');
  const [outputType, setOutputType] = useState<'message' | 'task' | 'notification'>('message');
  const [isSuccess, setIsSuccess] = useState(false);

  // Fetch existing definitions
  const { data: definitions = [], isLoading: listLoading } = useQuery<WorkflowDefinition[]>({
    queryKey: ['workflow_definitions'],
    queryFn: () => apiClient.get('/workflows/definitions').then((r: any) => r.data ?? r),
  });

  const createWorkflow = useMutation({
    mutationFn: (data: CreateWorkflowDefinition) => apiClient.post('/workflows/definitions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow_definitions'] });
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
      resetForm();
      setView('list');
    },
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateWorkflowDefinition> }) =>
      apiClient.patch(`/workflows/definitions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow_definitions'] });
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
      resetForm();
      setView('list');
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/workflows/definitions/${id}`, { status: 'inactive' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow_definitions'] });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setTriggerType('message');
    setPrompt('');
    setOutputType('message');
    setEditingId(null);
  };

  const handleEdit = (def: WorkflowDefinition) => {
    setEditingId(def.id);
    setName(def.name);
    setDescription(def.description ?? '');
    setTriggerType(def.trigger.type);
    setPrompt(def.prompt);
    setOutputType(def.output.type);
    setView('form');
  };

  const handleNewWorkflow = () => {
    resetForm();
    setView('form');
  };

  const handleSave = () => {
    const entities = prompt.match(/@(\w+)/g)?.map((e) => e.slice(1)) || [];
    const workflow: CreateWorkflowDefinition = {
      name,
      description,
      trigger: { type: triggerType, config: {} },
      prompt,
      entities,
      output: { type: outputType, config: {} },
      status: 'active',
    };

    if (editingId) {
      updateWorkflow.mutate({ id: editingId, data: workflow });
    } else {
      createWorkflow.mutate(workflow);
    }
  };

  const isPending = createWorkflow.isPending || updateWorkflow.isPending;
  const isError = createWorkflow.isError || updateWorkflow.isError;
  const errorMsg =
    (createWorkflow.error as any)?.message ??
    (updateWorkflow.error as any)?.message ??
    'Unknown error';

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={view === 'form' ? () => { resetForm(); setView('list'); } : onBack}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <GitBranch className="text-indigo-600" />
                Workflow Builder
              </h1>
              <p className="text-gray-500">Design automated workflows for your organization</p>
            </div>
          </div>

          {view === 'list' ? (
            <button
              onClick={handleNewWorkflow}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus size={18} />
              New Workflow
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { resetForm(); setView('list'); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <List size={18} />
                Back to List
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || !name || !prompt}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {isSuccess ? <CheckCircle size={18} /> : <Save size={18} />}
                {isPending ? 'Saving...' : isSuccess ? 'Saved!' : editingId ? 'Update Workflow' : 'Save Workflow'}
              </button>
            </div>
          )}
        </header>

        {/* List View */}
        {view === 'list' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {listLoading ? (
              <p className="text-sm text-gray-400 px-6 py-8 text-center">Loading workflows…</p>
            ) : definitions.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <GitBranch size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No workflow definitions yet.</p>
                <button
                  onClick={handleNewWorkflow}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline"
                >
                  <Plus size={16} />
                  Create your first workflow
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Trigger</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {definitions.map((def) => (
                    <tr key={def.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{def.name}</td>
                      <td className="px-6 py-4 text-gray-500 capitalize">{def.trigger.type}</td>
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            STATUS_BADGE[def.status] ?? STATUS_BADGE.inactive
                          )}
                        >
                          {def.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(def)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => deleteWorkflow.mutate(def.id)}
                            disabled={deleteWorkflow.isPending}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Deactivate"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Form View */}
        {view === 'form' && (
          <>
            {isError && (
              <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                Failed to save workflow: {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                {/* General Info */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">General Information</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Annual Leave Approval"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe what this workflow does..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                      />
                    </div>
                  </div>
                </section>

                {/* Prompt Editor */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Workflow Instruction (AI Prompt)</h2>
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500">
                      Tip: Use <span className="font-mono bg-gray-100 px-1 rounded">@collection_name</span> to automatically include entity data.
                    </p>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="When a user requests leave, check @leave_policies and then @leave_requests for overlaps..."
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                {/* Trigger Configuration */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Trigger</h2>
                  <div className="space-y-2">
                    {[
                      { id: 'message', icon: <MessageSquare size={16} />, label: 'User Message' },
                      { id: 'event', icon: <Zap size={16} />, label: 'System Event' },
                      { id: 'schedule', icon: <Calendar size={16} />, label: 'Scheduled' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTriggerType(t.id as any)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          triggerType === t.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                        )}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Output Configuration */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Output Action</h2>
                  <div className="space-y-2">
                    {[
                      { id: 'message', icon: <Send size={16} />, label: 'Send Message' },
                      { id: 'task', icon: <Plus size={16} />, label: 'Create Task' },
                      { id: 'notification', icon: <Bell size={16} />, label: 'Alert' },
                    ].map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setOutputType(o.id as any)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          outputType === o.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                        )}
                      >
                        {o.icon}
                        {o.label}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
