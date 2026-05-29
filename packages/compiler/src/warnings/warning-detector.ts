import type { CompilationWarning, LangGraphDefinition } from '@ops/shared';
import type { Registry } from '../registry/registry-interface';

// Phase 1a — stage 8: non-blocking warnings surfaced in the Skill Editor (spec §4.6).

export function detectWarnings(
  def: LangGraphDefinition,
  registry: Registry,
): CompilationWarning[] {
  const warnings: CompilationWarning[] = [];

  for (const node of def.nodes) {
    if (node.step_type === 'notify' && node.config.target === 'all') {
      warnings.push({
        code: 'broadcast',
        message: `Node '${node.id}' broadcasts to the whole organisation (@role:all).`,
      });
    }
    if (node.config.tool) {
      const tool = registry.getTool(node.config.tool);
      if (tool && !tool.pii_safe) {
        warnings.push({
          code: 'pii_unsafe_tool',
          message: `Node '${node.id}' calls '${tool.name}', which is not PII-safe; verify inputs carry no PII.`,
        });
      }
    }
  }

  return warnings;
}
