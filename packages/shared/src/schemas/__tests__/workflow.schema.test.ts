import { describe, it, expect } from 'vitest';
import { WorkflowSchema } from '../workflow.schema';

const validWorkflow = {
  workflow_id:   '550e8400-e29b-41d4-a716-446655440000',
  name:          'Leave Approval',
  current_state: 'awaiting_approval' as const,
  progress:      60,
  history: [
    { state: 'initiated',     timestamp: new Date('2025-06-01T09:00:00Z'), agent: 'intake' },
    { state: 'validating',    timestamp: new Date('2025-06-01T09:01:00Z'), agent: 'policy' },
  ],
  participants: ['550e8400-e29b-41d4-a716-446655440001'],
};

describe('WorkflowSchema', () => {
  it('parses a valid workflow', () => {
    const result = WorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
  });

  it('rejects progress outside 0-100', () => {
    expect(WorkflowSchema.safeParse({ ...validWorkflow, progress: -1 }).success).toBe(false);
    expect(WorkflowSchema.safeParse({ ...validWorkflow, progress: 101 }).success).toBe(false);
  });

  it('accepts progress of 0 and 100', () => {
    expect(WorkflowSchema.safeParse({ ...validWorkflow, progress: 0 }).success).toBe(true);
    expect(WorkflowSchema.safeParse({ ...validWorkflow, progress: 100 }).success).toBe(true);
  });

  it('rejects invalid current_state', () => {
    const result = WorkflowSchema.safeParse({ ...validWorkflow, current_state: 'flying' });
    expect(result.success).toBe(false);
  });

  it('coerces string timestamps in history', () => {
    const result = WorkflowSchema.parse({
      ...validWorkflow,
      history: [{ state: 'initiated', timestamp: '2025-06-01T09:00:00Z' }],
    });
    expect(result.history[0].timestamp).toBeInstanceOf(Date);
  });
});
