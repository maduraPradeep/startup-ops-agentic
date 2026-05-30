import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { CompilationResult, ParsedToken, ResolvedTokenContext } from '@ops/shared';

// Phase 1b — Skill Editor data layer. Mirrors useSchema.ts: thin useMutation wrappers over
// apiClient. There is no GET here — the operator authors text and compiles/resolves on demand,
// so both endpoints are POSTs modelled as mutations.
//
// IMPORTANT: these mutations DO NOT swallow errors. apiClient throws an Error with `.status`/
// `.data` on non-2xx, which propagates to the controller so it can map:
//   - 503 → the "compiler unavailable in this environment" state
//   - 400 → empty / invalid skill_text
// A *failed compile* is still HTTP 200 (a CompilationError union member), so it arrives as a
// successful mutation result, NOT a thrown error — the controller branches on `result.success`.

/** Body for POST /admin/skills/compile. */
export interface CompileBody {
  skill_text: string;
  author_role?: string;
}

/** Body for POST /admin/skills/tokens/resolve. */
export interface ResolveTokensBody {
  skill_text: string;
}

/**
 * 200 response of POST /admin/skills/tokens/resolve. Mirrors the API's `TokenResolveResult`
 * (skill-compiler.service.ts) — `resolved` is an ARRAY of ResolvedTokenContext, one per token.
 */
export type TokenResolveResult =
  | { ok: true; tokens: ParsedToken[]; resolved: ResolvedTokenContext[] }
  | { ok: false; errorType: string; message: string; token?: string };

export function useCompileSkill() {
  return useMutation({
    mutationFn: (body: CompileBody) =>
      apiClient.post<CompilationResult>('/admin/skills/compile', body),
  });
}

export function useResolveTokens() {
  return useMutation({
    mutationFn: (body: ResolveTokensBody) =>
      apiClient.post<TokenResolveResult>('/admin/skills/tokens/resolve', body),
  });
}
