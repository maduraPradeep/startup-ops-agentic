import type { ResolvedTokenContext } from '@ops/shared';

// Phase 1a — stage 3: assemble the compiler prompt. Must be DETERMINISTIC so the cache hash
// (which includes the resolved token contexts) is stable across runs.

export function sortResolved(resolved: ResolvedTokenContext[]): ResolvedTokenContext[] {
  return [...resolved].sort((a, b) => a.raw.localeCompare(b.raw));
}

export function buildCompilerPrompt(
  skillText: string,
  resolved: ResolvedTokenContext[],
): string {
  const tokenContext = sortResolved(resolved)
    .map((t) => `${t.raw} [${t.kind}] => ${JSON.stringify(t.resolved)}`)
    .join('\n');

  return [
    'You are the skill compiler. Compile the following skill into a LangGraph definition.',
    'Use only the resolved tokens provided. Emit <langgraph_definition>{...}</langgraph_definition>.',
    '',
    '--- SKILL ---',
    skillText.trim(),
    '',
    '--- RESOLVED TOKENS ---',
    tokenContext,
  ].join('\n');
}
