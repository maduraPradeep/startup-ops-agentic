import type { VerifiedIdentity } from './supabase-jwt';

// Phase 1b — legacy @fastify/jwt fallback path (dev/CI).
//
// When SUPABASE_JWT_SECRET is NOT set, the gateway verifies the tokens our own
// auth.controller signs with JWT_SECRET. Those carry our TokenPayload directly. They have no
// GoTrue session_id, so the revocation key is an explicit `jti` if present, else a stable
// per-user key (`legacy:{userId}`) — revoking it denies that user's legacy tokens until expiry.

export interface LegacyTokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
  tenant_name: string;
  jti?: string;
  session_id?: string;
  exp?: number;
}

export function resolveLegacyRevocationKey(payload: LegacyTokenPayload): string {
  return payload.jti ?? payload.session_id ?? `legacy:${payload.userId}`;
}

export function legacyRemainingTtl(payload: LegacyTokenPayload, nowSeconds = Math.floor(Date.now() / 1000)): number {
  if (typeof payload.exp !== 'number') return 0;
  return Math.max(0, payload.exp - nowSeconds);
}

/** Map a verified legacy TokenPayload onto our canonical identity. */
export function mapLegacyPayload(payload: LegacyTokenPayload): VerifiedIdentity {
  return {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    tenant_id: payload.tenant_id,
    tenant_name: payload.tenant_name,
    revocationKey: resolveLegacyRevocationKey(payload),
    remainingTtlSeconds: legacyRemainingTtl(payload),
  };
}
