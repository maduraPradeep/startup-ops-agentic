import type { ParsedToken, ResolvedTokenContext } from '@ops/shared';
import type { Registry } from '../registry/registry-interface';
import { TokenError } from '../errors';

// Phase 1a — stage 1 (resolve): look up each token in the registry, fail-fast on unknown
// references. The resolved context feeds the compiler prompt and the cache hash.

export function resolveTokens(
  tokens: ParsedToken[],
  registry: Registry,
): ResolvedTokenContext[] {
  return tokens.map((t) => ({ raw: t.raw, kind: t.kind, resolved: resolveOne(t, registry) }));
}

function resolveOne(token: ParsedToken, registry: Registry): Record<string, unknown> {
  switch (token.kind) {
    case 'entity': {
      const e = registry.getEntity(token.entity!);
      if (!e) throw new TokenError(`Unknown entity '${token.entity}'.`, token.raw, 'unknown_entity');
      return { entity: e.name, resource: e.resource, fields: e.fields };
    }
    case 'entity_field': {
      const e = registry.getEntity(token.entity!);
      if (!e) throw new TokenError(`Unknown entity '${token.entity}'.`, token.raw, 'unknown_entity');
      const field = e.fields.find((f) => f.name === token.field);
      if (!field) {
        throw new TokenError(
          `Entity '${token.entity}' has no field '${token.field}'.`,
          token.raw,
          'unknown_field',
        );
      }
      return { entity: e.name, resource: e.resource, field: field.name, field_type: field.field_type, pii: field.pii };
    }
    case 'role': {
      const r = registry.getRole(token.name!);
      if (!r) throw new TokenError(`Unknown role '${token.name}'.`, token.raw, 'unknown_role');
      return { name: r.name, permissions: r.permissions, broadcast: r.name === 'all' };
    }
    case 'agent': {
      const a = registry.getAgent(token.name!);
      if (!a) throw new TokenError(`Unknown agent '${token.name}'.`, token.raw, 'unknown_agent');
      return { name: a.name, label: a.label, tool_scopes: a.tool_scopes };
    }
    case 'external_tool': {
      const t = registry.getTool(token.name!);
      if (!t) throw new TokenError(`Unknown tool '${token.name}'.`, token.raw, 'unknown_tool');
      return { name: t.name, pii_safe: t.pii_safe, is_destructive: t.is_destructive };
    }
    case 'entity_tool': {
      const e = registry.getEntity(token.entity!);
      if (!e) throw new TokenError(`Unknown entity '${token.entity}'.`, token.raw, 'unknown_entity');
      if (!e.tool_ops.includes(token.op!)) {
        throw new TokenError(
          `Entity '${token.entity}' does not support operation '${token.op}'.`,
          token.raw,
          'unknown_operation',
        );
      }
      return { op: token.op, entity: e.name, resource: e.resource };
    }
    default:
      throw new TokenError(`Unsupported token '${token.raw}'.`, token.raw, 'unsupported_token');
  }
}
