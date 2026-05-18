import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, GitBranch, MessageSquare, Calendar, Zap, Send, CheckCircle, Bell } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { ArrowLeft } from 'lucide-react';
import type { CreateWorkflowDefinition } from '@ops/shared';

interface Props {
  onBack?: () => void;
}

export function WorkflowBuilderPage({ onBack }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'message' | 'event' | 'schedule'>('message');
  const [prompt, setPrompt] = useState('');
  const [outputType, setOutputType] = useState<'message' | 'task' | 'notification'>('message');
  const [isSuccess, setIsSuccess] = useState(false);

  const createWorkflow = useMutation({
    mutationFn: (data: CreateWorkflowDefinition) => apiClient.post('/workflows/definitions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow_definitions'] });
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
      // Reset form
      setName('');
      setDescription('');
      setPrompt('');
    },
  });

  const handleSave = () => {
    // Basic entity detection from prompt (words starting with @)
    const entities = prompt.match(/@(\w+)/g)?.map(e => e.slice(1)) || [];

    const workflow: CreateWorkflowDefinition = {
      name,
      description,
      trigger: { type: triggerType, config: {} },
      prompt,
      entities,
      output: { type: outputType, config: {} },
      status: 'active'
    };

    createWorkflow.mutate(workflow);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
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
          <button
            onClick={handleSave}
            disabled={createWorkflow.isPending || !name || !prompt}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isSuccess ? <CheckCircle size={18} /> : <Save size={18} />}
            {createWorkflow.isPending ? 'Saving...' : isSuccess ? 'Saved!' : 'Save Workflow'}
          </button>
        </header>

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
      </div>
    </div>
  );
}

function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
