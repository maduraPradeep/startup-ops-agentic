import type {
  AgentDefinition,
  EntityDefinition,
  PlatformField,
  RoleDefinition,
  ToolRegistryEntry,
} from '@ops/shared';
import type { Registry } from './registry-interface';
import {
  AGENT_FIXTURES,
  ENTITY_FIXTURES,
  ROLE_FIXTURES,
  TOOL_FIXTURES,
} from './fixtures';

// Phase 1a — in-memory Registry implementation backed by fixtures.
// The special pseudo-role "all" (broadcast) always resolves.

export class MockRegistry implements Registry {
  private entities = new Map<string, EntityDefinition>();
  private tools = new Map<string, ToolRegistryEntry>();
  private agents = new Map<string, AgentDefinition>();
  private roles = new Map<string, RoleDefinition>();

  constructor(opts?: {
    entities?: EntityDefinition[];
    tools?: ToolRegistryEntry[];
    agents?: AgentDefinition[];
    roles?: RoleDefinition[];
  }) {
    for (const e of opts?.entities ?? ENTITY_FIXTURES) this.entities.set(e.name, e);
    for (const t of opts?.tools ?? TOOL_FIXTURES) this.tools.set(t.name, t);
    for (const a of opts?.agents ?? AGENT_FIXTURES) this.agents.set(a.name, a);
    for (const r of opts?.roles ?? ROLE_FIXTURES) this.roles.set(r.name, r);
  }

  getEntity(name: string): EntityDefinition | null {
    return this.entities.get(name) ?? null;
  }

  getEntityFields(name: string): PlatformField[] {
    return this.entities.get(name)?.fields ?? [];
  }

  getTool(name: string): ToolRegistryEntry | null {
    return this.tools.get(name) ?? null;
  }

  getAgent(name: string): AgentDefinition | null {
    return this.agents.get(name) ?? null;
  }

  getRole(name: string): RoleDefinition | null {
    if (name === 'all') {
      // Broadcast pseudo-role: always resolvable, no inherent permissions.
      return { name: 'all', permissions: [] };
    }
    return this.roles.get(name) ?? null;
  }
}
