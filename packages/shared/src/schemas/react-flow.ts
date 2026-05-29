import { z } from 'zod';

// Phase 1a — React Flow graph produced for visual validation (spec §4.6).

export const ReactFlowNodeSchema = z.object({
  id: z.string(),
  type: z.string().default('default'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z
    .object({
      label: z.string(),
      step_type: z.string(),
    })
    .passthrough(),
});
export type ReactFlowNode = z.infer<typeof ReactFlowNodeSchema>;

export const ReactFlowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});
export type ReactFlowEdge = z.infer<typeof ReactFlowEdgeSchema>;

export const ReactFlowGraphSchema = z.object({
  nodes: z.array(ReactFlowNodeSchema),
  edges: z.array(ReactFlowEdgeSchema),
});
export type ReactFlowGraph = z.infer<typeof ReactFlowGraphSchema>;
