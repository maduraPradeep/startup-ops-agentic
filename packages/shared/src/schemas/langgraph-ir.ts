import { z } from 'zod';

// Phase 1a — LangGraph Intermediate Representation (spec §4.5).
//
// NOTE: `step_type` is intentionally a permissive string here, NOT a strict enum. The LLM
// may emit an invalid step type and we want that to be caught by the Structural Validator
// (stage `structural_validate`) with a helpful message — not rejected as malformed JSON at
// the `compile` stage. The whitelist lives in `constants/step-types` (STEP_TYPE_SET).

export const NodeConfigSchema = z
  .object({
    tokens: z.array(z.string()).optional(), // raw @tokens this node references
    agent: z.string().optional(), // agent assigned to run this node
    tool: z.string().optional(), // external tool name OR entity-tool scope key (resource:op)
    entity: z.string().optional(),
    op: z.string().optional(), // entity-tool operation (describe/create/...)
    target: z.string().optional(), // notify target role name ("owner", "all", ...)
    kind: z.enum(['data', 'approval']).optional(), // human_input: data collection vs authorization
    tool_inputs: z.array(z.string()).optional(), // state/entity fields fed into a tool (PII gate)
    output_field: z.string().optional(),
    fields: z.array(z.string()).optional(), // collect: fields gathered
    prompt: z.string().optional(),
  })
  .passthrough(); // keep unknown keys so injection strings survive to the validator
export type NodeConfig = z.infer<typeof NodeConfigSchema>;

export const LangGraphNodeSchema = z.object({
  id: z.string(),
  step_type: z.string(),
  config: NodeConfigSchema.default({}),
});
export type LangGraphNode = z.infer<typeof LangGraphNodeSchema>;

export const LangGraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
});
export type LangGraphEdge = z.infer<typeof LangGraphEdgeSchema>;

export const StateFieldSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});

export const StateSchemaSchema = z.object({
  fields: z.record(StateFieldSchema).default({}),
});

export const LangGraphDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  state_schema: StateSchemaSchema.default({ fields: {} }),
  entry_point: z.string(),
  nodes: z.array(LangGraphNodeSchema).min(1),
  edges: z.array(LangGraphEdgeSchema),
});
export type LangGraphDefinition = z.infer<typeof LangGraphDefinitionSchema>;
