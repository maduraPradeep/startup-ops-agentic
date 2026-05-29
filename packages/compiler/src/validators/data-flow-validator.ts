import type {
  CompilationError,
  LangGraphDefinition,
  LangGraphNode,
  ResolvedTokenContext,
} from '@ops/shared';
import { DESTRUCTIVE_ENTITY_OPS } from '@ops/shared';
import type { Registry } from '../registry/registry-interface';
import { compilationError } from '../errors';

// Phase 1a — stage 6 (data_flow_validate): PII gate, broadcast gate, destructive-tool HITL gate
// (spec §4.4).

export interface AuthorContext {
  role: string;
  permissions: string[];
}

export function validateDataFlow(
  def: LangGraphDefinition,
  resolved: ResolvedTokenContext[],
  registry: Registry,
  author: AuthorContext,
): CompilationError | null {
  const piiFields = collectPiiFields(resolved, registry);

  for (const node of def.nodes) {
    // PII gate: PII state/entity fields cannot flow into a tool with pii_safe=false.
    if (node.config.tool) {
      const tool = registry.getTool(node.config.tool);
      if (tool && !tool.pii_safe) {
        const bad = (node.config.tool_inputs ?? []).find((f) => piiFields.has(f));
        if (bad) {
          return compilationError(
            'data_flow_validate',
            'pii',
            `PII field '${bad}' cannot be sent to tool '${tool.name}' (pii_safe=false).`,
            { token_at_fault: `@tool:${tool.name}` },
          );
        }
      }
    }

    // Broadcast gate: notifying @role:all requires the author to hold notifications:broadcast.
    if (node.step_type === 'notify' && node.config.target === 'all') {
      if (!author.permissions.includes('notifications:broadcast')) {
        return compilationError(
          'data_flow_validate',
          'broadcast',
          `Broadcast to @role:all requires the 'notifications:broadcast' permission (author role '${author.role}' lacks it).`,
          { token_at_fault: '@role:all' },
        );
      }
    }

    // Destructive gate: a destructive operation must have a human_input ancestor.
    if (isDestructiveNode(node, registry) && !hasHumanInputAncestor(def, node.id)) {
      return compilationError(
        'data_flow_validate',
        'destructive',
        `Destructive operation in node '${node.id}' must have a human_input (approval) ancestor.`,
        { suggestion: 'Add an approval step before this destructive operation.' },
      );
    }
  }

  return null;
}

function collectPiiFields(resolved: ResolvedTokenContext[], registry: Registry): Set<string> {
  const pii = new Set<string>();
  for (const ctx of resolved) {
    if (ctx.kind !== 'entity' && ctx.kind !== 'entity_field') continue;
    const entityName = ctx.resolved.entity as string | undefined;
    if (!entityName) continue;
    for (const f of registry.getEntityFields(entityName)) {
      if (f.pii) pii.add(f.name);
    }
  }
  return pii;
}

function isDestructiveNode(node: LangGraphNode, registry: Registry): boolean {
  // External tool flagged destructive in the tool registry.
  if (node.config.tool) {
    const tool = registry.getTool(node.config.tool);
    if (tool?.is_destructive) return true;
  }
  // Entity-tool operation that is inherently destructive (delete/terminate).
  if (node.step_type === 'entity_tool' && node.config.op && DESTRUCTIVE_ENTITY_OPS.has(node.config.op)) {
    return true;
  }
  return false;
}

function hasHumanInputAncestor(def: LangGraphDefinition, nodeId: string): boolean {
  const incoming = new Map<string, string[]>();
  for (const e of def.edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e.from);
  }
  const byId = new Map(def.nodes.map((n) => [n.id, n]));

  const visited = new Set<string>();
  const queue = [...(incoming.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (byId.get(current)?.step_type === 'human_input') return true;
    queue.push(...(incoming.get(current) ?? []));
  }
  return false;
}
