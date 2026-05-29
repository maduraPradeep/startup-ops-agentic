import { describe, expect, it } from 'vitest';
import { createSigner } from 'fast-jwt';
import { ROLES } from '@ops/shared';
import {
  createSupabaseVerifier,
  mapGoTrueClaims,
  extractBearer,
  assertNotRevoked,
  TokenRevokedError,
} from '../services/supabase-jwt';
import { InMemoryTokenDenylist } from '../services/token-denylist';

// Phase 1b — Supabase GoTrue JWT verification + claim mapping (spec §11.1).
//
// Tokens are signed locally with a test secret using fast-jwt (the same library the auth path
// verifies with) — no live GoTrue required.

const SECRET = 'test-supabase-jwt-secret';
const TENANT = '00000000-0000-0000-0000-0000000000aa';

function sign(claims: Record<string, unknown>, secret = SECRET): string {
  const signer = createSigner({ key: secret, algorithm: 'HS256' });
  const now = Math.floor(Date.now() / 1000);
  return signer({ aud: 'authenticated', exp: now + 3600, ...claims });
}

describe('mapGoTrueClaims', () => {
  it('maps sub/email and pulls custom claims from app_metadata', () => {
    const id = mapGoTrueClaims({
      sub: 'user-123',
      email: 'a@b.com',
      session_id: 'sess-xyz',
      exp: Math.floor(Date.now() / 1000) + 100,
      app_metadata: {
        role: ROLES.HR_ADMIN,
        tenant_id: TENANT,
        tenant_name: 'Globex',
        name: 'Ada Lovelace',
      },
    });
    expect(id.userId).toBe('user-123');
    expect(id.email).toBe('a@b.com');
    expect(id.role).toBe(ROLES.HR_ADMIN);
    expect(id.tenant_id).toBe(TENANT);
    expect(id.tenant_name).toBe('Globex');
    expect(id.name).toBe('Ada Lovelace');
  });

  it('uses jti as the revocation key when present', () => {
    const id = mapGoTrueClaims({ sub: 'u', jti: 'jti-1', session_id: 'sess-1' });
    expect(id.revocationKey).toBe('jti-1');
  });

  it('falls back to session_id as the revocation key when jti is absent', () => {
    const id = mapGoTrueClaims({ sub: 'u', session_id: 'sess-1' });
    expect(id.revocationKey).toBe('sess-1');
  });

  it('falls back to sub when neither jti nor session_id is present', () => {
    const id = mapGoTrueClaims({ sub: 'u-only' });
    expect(id.revocationKey).toBe('u-only');
  });

  it('applies sensible defaults when custom claims are missing', () => {
    const id = mapGoTrueClaims({ sub: 'u', email: 'x@y.com' });
    expect(id.role).toBe(ROLES.EMPLOYEE);
    expect(id.tenant_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(id.name).toBe('x@y.com'); // email fallback when no name claim
  });

  it('computes a non-negative remaining TTL from exp', () => {
    const future = mapGoTrueClaims({ sub: 'u', exp: Math.floor(Date.now() / 1000) + 50 });
    expect(future.remainingTtlSeconds).toBeGreaterThan(0);
    const past = mapGoTrueClaims({ sub: 'u', exp: Math.floor(Date.now() / 1000) - 50 });
    expect(past.remainingTtlSeconds).toBe(0);
  });
});

describe('createSupabaseVerifier', () => {
  const verify = createSupabaseVerifier({ secret: SECRET });

  it('accepts a valid GoTrue token and maps claims', () => {
    const token = sign({
      sub: 'user-1',
      email: 'dev@acme.com',
      session_id: 'sess-1',
      app_metadata: { role: ROLES.HR_ADMIN, tenant_id: TENANT, tenant_name: 'Acme' },
    });
    const id = verify(token);
    expect(id.userId).toBe('user-1');
    expect(id.role).toBe(ROLES.HR_ADMIN);
    expect(id.tenant_id).toBe(TENANT);
    expect(id.revocationKey).toBe('sess-1');
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = sign({ sub: 'u', session_id: 's' }, 'wrong-secret');
    expect(() => verify(token)).toThrow();
  });

  it('rejects an expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const signer = createSigner({ key: SECRET, algorithm: 'HS256' });
    const token = signer({ sub: 'u', aud: 'authenticated', session_id: 's', exp: now - 10 });
    expect(() => verify(token)).toThrow();
  });

  it('rejects a token with the wrong audience', () => {
    const token = sign({ sub: 'u', session_id: 's', aud: 'other' });
    expect(() => verify(token)).toThrow();
  });
});

describe('extractBearer', () => {
  it('strips a Bearer prefix case-insensitively', () => {
    expect(extractBearer('Bearer abc.def')).toBe('abc.def');
    expect(extractBearer('bearer xyz')).toBe('xyz');
  });
  it('returns the raw value when there is no Bearer prefix', () => {
    expect(extractBearer('abc.def')).toBe('abc.def');
  });
  it('returns undefined for empty / missing values', () => {
    expect(extractBearer(undefined)).toBeUndefined();
    expect(extractBearer(null)).toBeUndefined();
    expect(extractBearer('')).toBeUndefined();
  });
});

describe('assertNotRevoked', () => {
  it('passes when the revocation key is not denied', async () => {
    const dl = new InMemoryTokenDenylist();
    await expect(assertNotRevoked({ revocationKey: 'sess-1' }, dl)).resolves.toBeUndefined();
  });

  it('throws TokenRevokedError when the revocation key is denied', async () => {
    const dl = new InMemoryTokenDenylist();
    await dl.deny('sess-1', 60);
    await expect(assertNotRevoked({ revocationKey: 'sess-1' }, dl)).rejects.toBeInstanceOf(
      TokenRevokedError,
    );
  });
});
