import { createVerifier } from 'fast-jwt';
import { createPublicKey } from 'crypto';
import { ROLES } from '@ops/shared';
import type { TokenDenylist } from './token-denylist';

// Phase 1b — Supabase GoTrue JWT verification (spec §11.1, "Auth split" risk).
//
// Self-hosted GoTrue signs access tokens HS256 with the project JWT secret. We verify the
// signature + exp + aud LOCALLY (no network call) with a configurable SUPABASE_JWT_SECRET,
// then map GoTrue's claims onto our existing TokenPayload shape. Custom claims (role,
// tenant_id, tenant_name, name) ride in `app_metadata`, which GoTrue mints into the access
// token via an auth hook / admin update.
//
// Revocation key choice: GoTrue access tokens carry `session_id` and typically do NOT carry
// `jti`. We use `jti` when present (forward-compatible / spec wording), otherwise fall back
// to `session_id` as the revocation key. Revoking a session_id denies every access token
// minted for that session until it expires — which is exactly the logout semantics we want.
//
// This mirrors the in-memory/real split used elsewhere: verification is a pure local function
// over a secret so it is fully unit-testable with a test secret (no live GoTrue needed).

/** Our canonical token shape — kept in sync with auth.plugin's TokenPayload. */
export interface VerifiedIdentity {
  userId: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
  tenant_name: string;
  /** Key used against the denylist: `jti` if present, else `session_id`, else `sub`. */
  revocationKey: string;
  /** Remaining lifetime in seconds (from `exp`), floored at 0 — used as the denylist TTL. */
  remainingTtlSeconds: number;
}

/** Raw GoTrue access-token claims we care about. */
interface GoTrueClaims {
  sub?: string;
  email?: string;
  exp?: number;
  jti?: string;
  session_id?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  [k: string]: unknown;
}

const DEV_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEV_TENANT_NAME = 'Acme Corp';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Map verified GoTrue claims → our identity, pulling custom claims from app_metadata. */
export function mapGoTrueClaims(claims: GoTrueClaims): VerifiedIdentity {
  const app = (claims.app_metadata ?? {}) as Record<string, unknown>;
  const user = (claims.user_metadata ?? {}) as Record<string, unknown>;

  const userId = str(claims.sub) ?? '';
  const email = str(claims.email) ?? '';
  // GoTrue's top-level `role` is the Postgres role ("authenticated"); prefer our app role.
  const role = str(app.role) ?? str(app.tenant_role) ?? ROLES.EMPLOYEE;
  const tenant_id = str(app.tenant_id) ?? DEV_TENANT_ID;
  const tenant_name = str(app.tenant_name) ?? DEV_TENANT_NAME;
  const name = str(app.name) ?? str(user.name) ?? str(user.full_name) ?? email;

  const revocationKey = str(claims.jti) ?? str(claims.session_id) ?? userId;

  const exp = typeof claims.exp === 'number' ? claims.exp : 0;
  const remainingTtlSeconds = Math.max(0, exp - Math.floor(Date.now() / 1000));

  return { userId, email, name, role, tenant_id, tenant_name, revocationKey, remainingTtlSeconds };
}

/**
 * Verifies a Supabase-issued JWT. Returns the mapped identity on success.
 * Async to support both JWKS (ES256, key lookup by kid) and HS256 paths.
 */
export type SupabaseTokenVerifier = (token: string) => Promise<VerifiedIdentity>;

export interface SupabaseVerifierOptions {
  secret: string;
  /** GoTrue access tokens use aud "authenticated"; override for tests if needed. */
  audience?: string;
}

/** HS256 path — used when SUPABASE_JWT_SECRET is set and no EC keys were found in JWKS. */
export function createSupabaseVerifier(opts: SupabaseVerifierOptions): SupabaseTokenVerifier {
  const verify = createVerifier({
    key: opts.secret,
    algorithms: ['HS256'],
    allowedAud: opts.audience ?? 'authenticated',
  });
  return async (token: string): Promise<VerifiedIdentity> => {
    const claims = verify(token) as GoTrueClaims;
    return mapGoTrueClaims(claims);
  };
}

interface JwkEntry {
  kid: string;
  /** PEM-encoded public key — fast-jwt requires a string/Buffer, not a KeyObject. */
  pem: string;
}

/**
 * Fetch the JWKS document from Supabase and return parsed key entries.
 * Skips non-EC / non-sig keys silently.
 */
export async function fetchJwks(jwksUrl: string): Promise<JwkEntry[]> {
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status} ${jwksUrl}`);
  const { keys } = (await res.json()) as { keys: Array<Record<string, unknown>> };
  return keys
    .filter((k) => k.use === 'sig' && k.kty === 'EC')
    .map((k) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keyObj = createPublicKey({ key: k as any, format: 'jwk' });
      return {
        kid: k.kid as string,
        pem: keyObj.export({ type: 'spki', format: 'pem' }) as string,
      };
    });
}

/**
 * ES256 path — used when Supabase is configured to issue asymmetric (EC) JWTs.
 * Keys are resolved by `kid` from the pre-fetched JWKS.
 */
export function createSupabaseVerifierFromJwks(
  keys: JwkEntry[],
  audience?: string,
): SupabaseTokenVerifier {
  const keyMap = new Map(keys.map((k) => [k.kid, k.pem]));

  const verify = createVerifier({
    // fast-jwt passes the full decoded object {header, payload, signature} to the key callback
    key: async (decoded: { header: Record<string, unknown> }) => {
      const kid = decoded.header?.kid as string | undefined;
      const pem = keyMap.get(kid ?? '');
      if (!pem) throw new Error(`Unknown kid: ${kid}`);
      return pem;
    },
    algorithms: ['ES256'],
    allowedAud: audience ?? 'authenticated',
  });

  return async (token: string): Promise<VerifiedIdentity> => {
    const claims = (await verify(token)) as GoTrueClaims;
    return mapGoTrueClaims(claims);
  };
}

/** Strip a leading `Bearer ` (case-insensitive) from an Authorization header value. */
export function extractBearer(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1] : value.trim() || undefined;
}

/** Throws when a token's revocation key is on the denylist. */
export class TokenRevokedError extends Error {
  constructor() {
    super('Token revoked');
    this.name = 'TokenRevokedError';
  }
}

/**
 * Asserts a verified identity has not been revoked. Shared by the HTTP authenticate hook and
 * the WS connect guard so the two never drift.
 */
export async function assertNotRevoked(
  identity: Pick<VerifiedIdentity, 'revocationKey'>,
  denylist: TokenDenylist,
): Promise<void> {
  if (await denylist.isDenied(identity.revocationKey)) {
    throw new TokenRevokedError();
  }
}
