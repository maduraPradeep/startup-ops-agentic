import type { CompilationError, LangGraphDefinition, ParsedToken } from '@ops/shared';
import { INJECTION_REGEX, STEP_TYPE_SET } from '@ops/shared';
import type { Registry } from '../registry/registry-interface';
import { compilationError } from '../errors';
import { scopeMatches } from './tool-scope-checker';

// Phase 1a — stage 5 (structural_validate): token exact-match, step-type whitelist, entity-ref
// match, SQL/shell guard, agent tool-scope check. Returns null when the definition is sound.

export function validateStructural(
  def: LangGraphDefinition,
  parsedTokens: ParsedToken[],
  registry: Registry,
): CompilationError | null {
  const parsedRaw = new Set(parsedTokens.map((t) => t.raw));
  const parsedEntities = new Set(
    parsedTokens
      .filter((t) => t.kind === 'entity' || t.kind === 'entity_field' || t.kind === 'entity_tool')
      .map((t) => t.entity),
  );

  // SQL / shell injection guard over the whole serialized definition.
  if (INJECTION_REGEX.test(JSON.stringify(def))) {
    return compilationError(
      'structural_validate',
      'injection',
      'Compiled definition contains forbidden SQL/shell syntax.',
      { suggestion: 'Skill steps must not embed raw SQL or shell. Use entity tools instead.' },
    );
  }

  for (const node of def.nodes) {
    // Step-type whitelist.
    if (!STEP_TYPE_SET.has(node.step_type)) {
      return compilationError(
        'structural_validate',
        'invalid_step_type',
        `Node '${node.id}' has invalid step_type '${node.step_type}'.`,
      );
    }

    // Token exact-match: every token a node references must come from the skill text.
    for (const tk of node.config.tokens ?? []) {
      if (!parsedRaw.has(tk)) {
        return compilationError(
          'structural_validate',
          'unknown_token',
          `Node '${node.id}' references token '${tk}' that is not present in the skill text.`,
          { token_at_fault: tk },
        );
      }
    }

    // Entity references must correspond to a declared entity token.
    if (node.config.entity && !parsedEntities.has(node.config.entity)) {
      return compilationError(
        'structural_validate',
        'entity_mismatch',
        `Node '${node.id}' references entity '${node.config.entity}' not declared in the skill.`,
      );
    }

    // Agent tool-scope check (only when a node assigns both an agent and a tool).
    if (node.config.agent && node.config.tool) {
      const agent = registry.getAgent(node.config.agent);
      if (!agent) {
        return compilationError(
          'structural_validate',
          'unknown_agent',
          `Node '${node.id}' references unknown agent '${node.config.agent}'.`,
          { token_at_fault: `@agent:${node.config.agent}` },
        );
      }
      if (!scopeMatches(agent.tool_scopes, node.config.tool)) {
        return compilationError(
          'structural_validate',
          'tool_scope',
          `Agent '${agent.name}' (${agent.label}) does not have scope for '${node.config.tool}'.`,
          {
            token_at_fault: `@agent:${agent.name}`,
            suggestion: `Ask the platform admin to add '${node.config.tool}' scope to ${agent.label}, or assign this step to an agent that has it.`,
          },
        );
      }
    }
  }

  return null;
}
