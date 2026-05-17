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
