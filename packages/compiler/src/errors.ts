import type { CompilationError, CompilationStage } from '@ops/shared';

// Phase 1a — structured compilation error helper (spec §11.6).

export function compilationError(
  stage: CompilationStage,
  error_type: string,
  message: string,
  opts?: { token_at_fault?: string; suggestion?: string },
): CompilationError {
  return {
    success: false,
    stage,
    error_type,
    message,
    ...(opts?.token_at_fault ? { token_at_fault: opts.token_at_fault } : {}),
    ...(opts?.suggestion ? { suggestion: opts.suggestion } : {}),
  };
}

/** Thrown by the parser/resolver; carries the offending token so it surfaces in the error. */
export class TokenError extends Error {
  constructor(
    message: string,
    public readonly token: string,
    public readonly errorType: string,
  ) {
    super(message);
    this.name = 'TokenError';
  }
}
