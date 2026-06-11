import { z } from 'zod';

// Phase 1a — explicit execution state machine (spec §4.8, changelog #19).
//
// `awaiting_human_input` = collecting data; any authenticated session user may provide it.
// `awaiting_approval`     = authorization gate; a member of a specific @role must approve.
// The distinction drives SLA calculation, escalation, and observability.

export const ExecutionStateSchema = z.enum([
  'initiated',
  'running',
  'awaiting_human_input',
  'awaiting_approval',
  'retrying',
  'error',
  'completed',
  'cancelled',
]);
export type ExecutionState = z.infer<typeof ExecutionStateSchema>;
