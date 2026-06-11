import type { ParsedToken } from '@ops/shared';
import { TOKEN_PREFIX_SET, TOKEN_SCAN_REGEX } from '@ops/shared';
import { TokenError } from '../errors';

// Phase 1a — stage 1 (parse): extract and classify @tokens, fail-fast on unknown kinds/shapes.

export function parseTokens(skillText: string): ParsedToken[] {
  const out: ParsedToken[] = [];
  const seen = new Set<string>();

  // Reset lastIndex defensively (regex is module-level with the `g` flag).
  TOKEN_SCAN_REGEX.lastIndex = 0;
  for (const match of skillText.matchAll(TOKEN_SCAN_REGEX)) {
    const raw = match[0];
    const prefix = match[1]!;
    const body = match[2]!;

    if (!TOKEN_PREFIX_SET.has(prefix)) {
      throw new TokenError(
        `Unknown token kind '@${prefix}:'. Valid kinds: @entity, @role, @agent, @tool, @tools.`,
        raw,
        'unknown_token_kind',
      );
    }

    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(classify(raw, prefix, body));
  }

  return out;
}

function classify(raw: string, prefix: string, body: string): ParsedToken {
  switch (prefix) {
    case 'entity': {
      if (body.includes('.')) {
        const [entity, field] = body.split('.', 2);
        return { raw, kind: 'entity_field', entity, field };
      }
      return { raw, kind: 'entity', entity: body };
    }
    case 'role':
      return { raw, kind: 'role', name: body };
    case 'agent':
      return { raw, kind: 'agent', name: body };
    case 'tool':
      return { raw, kind: 'external_tool', name: body };
    case 'tools': {
      const parts = body.split(':');
      if (parts.length !== 2) {
        throw new TokenError(
          `Entity tool '${raw}' must be of the form @tools:<operation>:<entity>.`,
          raw,
          'malformed_entity_tool',
        );
      }
      return { raw, kind: 'entity_tool', op: parts[0], entity: parts[1] };
    }
    default:
      // Unreachable: prefix membership was checked by the caller.
      throw new TokenError(`Unknown token kind '@${prefix}:'.`, raw, 'unknown_token_kind');
  }
}
