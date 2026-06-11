import type { CompilationResult, CompilationSuccess } from '@ops/shared';
import { LangGraphDefinitionSchema } from '@ops/shared';
import type { Registry } from './registry/registry-interface';
import type { LLMClient } from './llm/llm-interface';
import { CompilationCache, computeHash } from './cache/compilation-cache';
import { parseTokens } from './parser/token-parser';
import { resolveTokens } from './parser/token-resolver';
import { buildCompilerPrompt } from './prompt/build-prompt';
import { validateStructural } from './validators/structural-validator';
import { validateDataFlow, type AuthorContext } from './validators/data-flow-validator';
import { generateReactFlow } from './flow/react-flow-generator';
import { detectWarnings } from './warnings/warning-detector';
import { compilationError, TokenError } from './errors';

// Phase 1a — the 9-stage compilation pipeline (spec §4.4).

export interface CompileOptions {
  llm: LLMClient;
  registry: Registry;
  /** Role of the skill author; used for the broadcast permission gate. Default: hr_admin. */
  authorRole?: string;
  /** Shared cache instance (pass the same one across calls to observe cache hits). */
  cache?: CompilationCache;
}

export async function compileSkill(
  skillText: string,
  opts: CompileOptions,
): Promise<CompilationResult> {
  const { llm, registry } = opts;

  // Stage 1 — parse + resolve tokens (fail-fast on unknown).
  let parsed;
  let resolved;
  try {
    parsed = parseTokens(skillText);
    resolved = resolveTokens(parsed, registry);
  } catch (err) {
    if (err instanceof TokenError) {
      return compilationError('parse', err.errorType, err.message, { token_at_fault: err.token });
    }
    return compilationError('parse', 'parse_error', (err as Error).message);
  }

  // Resolve the author's permissions for the broadcast gate.
  const authorRole = opts.authorRole ?? 'hr_admin';
  const author: AuthorContext = {
    role: authorRole,
    permissions: registry.getRole(authorRole)?.permissions ?? [],
  };

  // Stage 2 — compilation cache check.
  const hash = computeHash(skillText, resolved);
  if (opts.cache) {
    const hit = opts.cache.get(hash);
    if (hit) return { ...hit, from_cache: true };
  }

  // Stage 3 — build compiler prompt (deterministic).
  const prompt = buildCompilerPrompt(skillText, resolved);

  // Stage 4 — call the (mocked) compiler LLM.
  let rawDef: unknown;
  try {
    rawDef = await llm.compile(prompt);
  } catch (err) {
    return compilationError('compile', 'llm_error', `Compiler LLM failed: ${(err as Error).message}`);
  }

  const parsedDef = LangGraphDefinitionSchema.safeParse(rawDef);
  if (!parsedDef.success) {
    return compilationError(
      'compile',
      'invalid_definition',
      `Compiler returned an invalid LangGraph definition: ${parsedDef.error.issues[0]?.message ?? 'schema error'}`,
    );
  }
  const def = parsedDef.data;

  // Stage 5 — structural validation (incl. agent tool-scope).
  const structuralError = validateStructural(def, parsed, registry);
  if (structuralError) return structuralError;

  // Stage 6 — data flow validation.
  const dataFlowError = validateDataFlow(def, resolved, registry, author);
  if (dataFlowError) return dataFlowError;

  // Stage 7 — generate React Flow graph.
  const react_flow_graph = generateReactFlow(def);

  // Stage 8 — non-blocking warnings.
  const warnings = detectWarnings(def, registry);

  // Stage 9 — assemble + cache the validated compilation.
  const result: CompilationSuccess = {
    success: true,
    langgraph_def: def,
    react_flow_graph,
    warnings,
    parsed_tokens: parsed,
    compilation_hash: hash,
    from_cache: false,
  };
  if (opts.cache) opts.cache.set(hash, result);
  return result;
}
