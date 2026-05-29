import type { CompilationResult, ParsedToken, ResolvedTokenContext } from '@ops/shared';
import {
  CompilationCache,
  compileSkill,
  parseTokens,
  resolveTokens,
  TokenError,
  type LLMClient,
  type Registry,
} from '@ops/compiler';

// Phase 1b — HTTP-facing wrapper around the @ops/compiler pipeline (spec §4).
//
// Holds ONE shared CompilationCache across requests so an identical re-compile is a cache
// hit (from_cache:true) without re-calling the LLM — the acceptance criterion for
// POST /admin/skills/compile. Persistence is optional and behind an interface so the
// service is unit-tested with MockLLM + MockRegistry and no DB; in prod a Postgres store
// writes each result to `skill_compilations` keyed by compilation_hash.

export interface CompilationStore {
  /** Persist a compilation result for a tenant (idempotent on (tenant, hash)). */
  save(tenantId: string, result: CompilationResult): Promise<void>;
}

export interface CompileRequest {
  tenantId: string;
  skillText: string;
  authorRole?: string;
}

export type TokenResolveResult =
  | { ok: true; tokens: ParsedToken[]; resolved: ResolvedTokenContext[] }
  | { ok: false; errorType: string; message: string; token?: string };

export class SkillCompilerService {
  private readonly cache: CompilationCache;
  private readonly store?: CompilationStore;

  constructor(
    private readonly registry: Registry,
    private readonly llm: LLMClient,
    opts: { cache?: CompilationCache; store?: CompilationStore } = {},
  ) {
    this.cache = opts.cache ?? new CompilationCache();
    this.store = opts.store;
  }

  async compile(req: CompileRequest): Promise<CompilationResult> {
    const result = await compileSkill(req.skillText, {
      llm: this.llm,
      registry: this.registry,
      authorRole: req.authorRole,
      cache: this.cache,
    });

    // Persist real (non-cache-hit) compilations; a cache hit was already stored.
    // Failures are never cached by the pipeline, so they are always recorded.
    const isCacheHit = result.success && result.from_cache;
    if (this.store && !isCacheHit) {
      await this.store.save(req.tenantId, result);
    }
    return result;
  }

  /** Parse + resolve tokens for editor autocomplete (POST /admin/skills/tokens/resolve). */
  resolveTokens(skillText: string): TokenResolveResult {
    try {
      const tokens = parseTokens(skillText);
      const resolved = resolveTokens(tokens, this.registry);
      return { ok: true, tokens, resolved };
    } catch (err) {
      if (err instanceof TokenError) {
        return { ok: false, errorType: err.errorType, message: err.message, token: err.token };
      }
      return { ok: false, errorType: 'parse_error', message: (err as Error).message };
    }
  }
}
