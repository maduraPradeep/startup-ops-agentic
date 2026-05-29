import { z } from 'zod';

// Phase 1a — platform-config registry shapes (spec §3.2, §5.3, §10.1).
//
// In Phase 1b these are backed by Postgres tables (NOT Directus). In Phase 1a they are
// served by an in-memory mock registry. Field names mirror the spec's collections.

export const PlatformFieldSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  field_type: z.string(),
  is_required: z.boolean().default(false),
  is_system: z.boolean().default(true), // platform (Tier 1) vs tenant (Tier 2)
  pii: z.boolean().default(false), // drives the Data Flow Validator PII gate
  sort_order: z.number().default(100),
});
export type PlatformField = z.infer<typeof PlatformFieldSchema>;

export const EntityDefinitionSchema = z.object({
  name: z.string(), // token name, e.g. "people"
  label: z.string(),
  resource: z.string(), // scope/permission key, e.g. "employees"
  fields: z.array(PlatformFieldSchema),
  tool_ops: z.array(z.string()), // supported @tools operations
});
export type EntityDefinition = z.infer<typeof EntityDefinitionSchema>;

export const ToolRegistryEntrySchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  pii_safe: z.boolean(),
  is_destructive: z.boolean(),
  input_schema: z.unknown().optional(),
  output_schema: z.unknown().optional(),
});
export type ToolRegistryEntry = z.infer<typeof ToolRegistryEntrySchema>;

export const AgentDefinitionSchema = z.object({
  name: z.string(),
  label: z.string(),
  tool_scopes: z.array(z.string()), // e.g. ["employees:*", "leave_requests:*"]
  step_types: z.array(z.string()).default([]),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const RoleDefinitionSchema = z.object({
  name: z.string(),
  permissions: z.array(z.string()),
});
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;
