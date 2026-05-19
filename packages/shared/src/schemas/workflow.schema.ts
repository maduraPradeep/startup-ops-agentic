import { z } from 'zod';

export const WorkflowStateEnum = z.enum([
  'initiated', 'collecting_info', 'validating', 'awaiting_approval',
  'escalated', 'approved', 'rejected', 'completed', 'error',
]);

export const WorkflowSchema = z.object({
  workflow_id: z.string().uuid(),
  name: z.string(),
  current_state: WorkflowStateEnum,
  progress: z.number().min(0).max(100),
  history: z.array(z.object({
    state: WorkflowStateEnum,
    timestamp: z.coerce.date(),
    agent: z.string().optional(),
    message: z.string().optional(),
  })),
  pending_actions: z.array(z.object({
    type: z.enum(['approval', 'input', 'review']),
    required_from: z.string().uuid().optional(),
    deadline: z.coerce.date().optional(),
  })).optional(),
  participants: z.array(z.string().uuid()),
  tenant_id: z.string().uuid().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

export const WorkflowTriggerSchema = z.object({
  type: z.enum(['message', 'event', 'schedule']),
  config: z.record(z.unknown()),
});

export const WorkflowOutputSchema = z.object({
  type: z.enum(['message', 'task', 'notification']),
  config: z.record(z.unknown()),
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: WorkflowTriggerSchema,
  prompt: z.string().min(1),
  entities: z.array(z.string()).default([]),
  output: WorkflowOutputSchema,
  status: z.enum(['active', 'inactive']).default('active'),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const CreateWorkflowDefinitionSchema = WorkflowDefinitionSchema.omit({
  id: true, tenant_id: true, created_at: true, updated_at: true,
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type CreateWorkflowDefinition = z.infer<typeof CreateWorkflowDefinitionSchema>;
