import type {
  AgentDefinition,
  EntityDefinition,
  PlatformField,
  RoleDefinition,
  ToolRegistryEntry,
} from '@ops/shared';

// Phase 1a — abstraction over the platform-config source of truth (spec §3.4).
// The Phase 1b implementation reads Postgres (no Directus); Phase 1a uses an in-memory mock.

export interface Registry {
  getEntity(name: string): EntityDefinition | null;
  getEntityFields(name: string): PlatformField[];
  getTool(name: string): ToolRegistryEntry | null;
  getAgent(name: string): AgentDefinition | null;
  getRole(name: string): RoleDefinition | null;
}
