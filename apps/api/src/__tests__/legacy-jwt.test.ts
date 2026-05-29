import { describe, expect, it } from 'vitest';
import { ROLES } from '@ops/shared';
import {
  mapLegacyPayload,
  resolveLegacyRevocationKey,
  legacyRemainingTtl,
} from '../services/legacy-jwt';

// Phase 1b — legacy @fastify/jwt fallback path (used when SUPABASE_JWT_SECRET is unset).

const base = {
  userId: 'u-1',
  email: 'dev@acme.com',
  name: 'Dev User',
  role: ROLES.HR_ADMIN,
  tenant_id: '00000000-0000-0000-0000-000000000001',
  tenant_name: 'Acme Corp',
};

describe('mapLegacyPayload', () => {
  it('maps our TokenPayload straight onto the canonical identity', () => {
    const id = mapLegacyPayload(base);
    expect(id.userId).toBe('u-1');
    expect(id.role).toBe(ROLES.HR_ADMIN);
    expect(id.tenant_id).toBe(base.tenant_id);
  });

  it('derives a stable per-user revocation key when there is no jti/session_id', () => {
    expect(resolveLegacyRevocationKey(base)).toBe('legacy:u-1');
  });

  it('prefers an explicit jti over the per-user fallback', () => {
    expect(resolveLegacyRevocationKey({ ...base, jti: 'jti-9' })).toBe('jti-9');
  });

  it('computes remaining TTL from exp and floors at 0', () => {
    expect(legacyRemainingTtl({ ...base, exp: 100 }, 40)).toBe(60);
    expect(legacyRemainingTtl({ ...base, exp: 100 }, 200)).toBe(0);
    expect(legacyRemainingTtl(base)).toBe(0); // no exp
  });
});
