import {
  AgentDefinitionSchema,
  EntityDefinitionSchema,
  RoleDefinitionSchema,
  ToolRegistryEntrySchema,
  type AgentDefinition,
  type EntityDefinition,
  type PlatformField,
  type RoleDefinition,
  type ToolRegistryEntry,
} from '@ops/shared';
import type { Registry } from '@ops/compiler';
import type { SupabaseClient } from '../db/supabase-client';

// Phase 1b — Postgres-backed Registry. It is the canonical platform-config source
// (the no-Directus replacement) and is a drop-in for MockRegistry: same `Registry`
// interface, same shapes, same `getRole('all')` broadcast pseudo-role behavior.
//
// The Registry interface is synchronous (the compiler resolves tokens synchronously),
// so PostgresRegistry hydrates an in-memory snapshot once via the async `create()`
// factory, then serves reads from that snapshot. Rows are validated through the
// @ops/shared Zod schemas — the same contract MockRegistry's fixtures satisfy — so
// any drift between the DB and the shared shapes fails loudly at load time.

interface PlatformFieldRow {
  name: string;
  label: string | null;
  field_type: string;
  is_required: boolean;
  is_system: boolean;
  pii: boolean;
  sort_order: number;
}

export class PostgresRegistry implements Registry {
  private readonly entities: Map<string, EntityDefinition>;
  private readonly tools: Map<string, ToolRegistryEntry>;
  private readonly agents: Map<string, AgentDefinition>;
  private readonly roles: Map<string, RoleDefinition>;

  private constructor(snapshot: {
    entities: EntityDefinition[];
    tools: ToolRegistryEntry[];
    agents: AgentDefinition[];
    roles: RoleDefinition[];
  }) {
    this.entities = new Map(snapshot.entities.map((e) => [e.name, e]));
    this.tools = new Map(snapshot.tools.map((t) => [t.name, t]));
    this.agents = new Map(snapshot.agents.map((a) => [a.name, a]));
    this.roles = new Map(snapshot.roles.map((r) => [r.name, r]));
  }

  /** Load the full platform config from Postgres and build a synchronous registry. */
  static async create(client: SupabaseClient): Promise<PostgresRegistry> {
    const [entityRows, fieldRows, toolRows, agentRows, roleRows] = await Promise.all([
      client.query<{ name: string; label: string; resource: string; tool_ops: unknown }>(
        'SELECT name, label, resource, tool_ops FROM entity_definitions ORDER BY name',
      ),
      client.query<PlatformFieldRow & { entity_name: string }>(
        'SELECT entity_name, name, label, field_type, is_required, is_system, pii, sort_order FROM platform_fields ORDER BY entity_name, sort_order, name',
      ),
      client.query<{
        name: string;
        label: string | null;
        pii_safe: boolean;
        is_destructive: boolean;
        input_schema: unknown;
        output_schema: unknown;
      }>(
        'SELECT name, label, pii_safe, is_destructive, input_schema, output_schema FROM tool_registry ORDER BY name',
      ),
      client.query<{ name: string; label: string; tool_scopes: unknown; step_types: unknown }>(
        'SELECT name, label, tool_scopes, step_types FROM agent_definitions ORDER BY name',
      ),
      client.query<{ name: string; permissions: unknown }>(
        'SELECT name, permissions FROM roles ORDER BY name',
      ),
    ]);

    // Group platform fields by entity, preserving sort order, then validate the
    // assembled EntityDefinition against the shared schema.
    const fieldsByEntity = new Map<string, PlatformField[]>();
    for (const row of fieldRows) {
      const field = PostgresRegistry.toPlatformField(row);
      const list = fieldsByEntity.get(row.entity_name) ?? [];
      list.push(field);
      fieldsByEntity.set(row.entity_name, list);
    }

    const entities = entityRows.map((row) =>
      EntityDefinitionSchema.parse({
        name: row.name,
        label: row.label,
        resource: row.resource,
        tool_ops: asStringArray(row.tool_ops),
        fields: fieldsByEntity.get(row.name) ?? [],
      }),
    );

    const tools = toolRows.map((row) =>
      ToolRegistryEntrySchema.parse({
        name: row.name,
        label: row.label ?? undefined,
        pii_safe: row.pii_safe,
        is_destructive: row.is_destructive,
        input_schema: row.input_schema ?? undefined,
        output_schema: row.output_schema ?? undefined,
      }),
    );

    const agents = agentRows.map((row) =>
      AgentDefinitionSchema.parse({
        name: row.name,
        label: row.label,
        tool_scopes: asStringArray(row.tool_scopes),
        step_types: asStringArray(row.step_types),
      }),
    );

    const roles = roleRows.map((row) =>
      RoleDefinitionSchema.parse({
        name: row.name,
        permissions: asStringArray(row.permissions),
      }),
    );

    return new PostgresRegistry({ entities, tools, agents, roles });
  }

  private static toPlatformField(row: PlatformFieldRow): PlatformField {
    // PlatformFieldSchema has defaults; only include label when present so the
    // optional field stays absent (matching the fixtures) rather than null.
    const base: Record<string, unknown> = {
      name: row.name,
      field_type: row.field_type,
      is_required: row.is_required,
      is_system: row.is_system,
      pii: row.pii,
      sort_order: row.sort_order,
    };
    if (row.label !== null && row.label !== undefined) base.label = row.label;
    return base as unknown as PlatformField;
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
      // Mirrors MockRegistry exactly.
      return { name: 'all', permissions: [] };
    }
    return this.roles.get(name) ?? null;
  }
}

/** Coerce a JSONB column (pg returns parsed JSON) into a string[]. */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  }
  return [];
}
