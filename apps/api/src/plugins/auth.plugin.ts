import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ROLES, ROLE_PERMISSIONS } from '@ops/shared';
import {
  RedisTokenDenylist,
  InMemoryTokenDenylist,
  type TokenDenylist,
} from '../services/token-denylist.js';
import {
  createSupabaseVerifier,
  createSupabaseVerifierFromJwks,
  fetchJwks,
  extractBearer,
  type SupabaseTokenVerifier,
  type VerifiedIdentity,
} from '../services/supabase-jwt.js';
import { mapLegacyPayload } from '../services/legacy-jwt.js';

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
  tenant_name: string;
  // Optional revocation claims. Legacy (@fastify/jwt) tokens we mint may carry `jti`; GoTrue
  // tokens carry `session_id`. Either becomes the denylist key (see resolveLegacyRevocationKey).
  jti?: string;
  session_id?: string;
  exp?: number;
}

// Teach @fastify/jwt the shape of our token
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Redis-backed when available, in-memory otherwise. Owns jti/session revocation. */
    tokenDenylist: TokenDenylist;
    /** Set when SUPABASE_JWT_SECRET is configured; verifies GoTrue-issued JWTs locally. */
    supabaseVerifier: SupabaseTokenVerifier | null;
    /**
     * Verifies a raw bearer token (GoTrue first if configured, else legacy @fastify/jwt) and
     * checks the denylist. Shared by the HTTP hook and the WS connect guard so they can't drift.
     * Returns the identity + revocation key, or throws on invalid/expired/revoked.
     */
    verifyBearer: (token: string) => Promise<VerifiedIdentity>;
  }
  interface FastifyRequest {
    /** Set by `authenticate` so route handlers can revoke the current token (logout). */
    revocationKey?: string;
    revocationTtlSeconds?: number;
  }
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'dev-insecure-secret',
  });

  // Denylist: Redis when the redis plugin decorated the instance, else in-memory (dev/CI).
  const denylist: TokenDenylist = fastify.hasDecorator('redis')
    ? new RedisTokenDenylist(fastify.redis)
    : new InMemoryTokenDenylist();
  fastify.decorate('tokenDenylist', denylist);

  // Supabase GoTrue verification — prefer JWKS (ES256) when SUPABASE_URL is set; fall back to
  // HS256 when only SUPABASE_JWT_SECRET is configured; fall back to legacy @fastify/jwt otherwise.
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_JWT_SECRET;
  const audience = process.env.SUPABASE_JWT_AUD ?? 'authenticated';

  let supabaseVerifier: SupabaseTokenVerifier | null = null;

  if (supabaseUrl) {
    try {
      const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
      const keys = await fetchJwks(jwksUrl);
      if (keys.length > 0) {
        supabaseVerifier = createSupabaseVerifierFromJwks(keys, audience);
        fastify.log.info(`[auth] JWKS loaded (${keys.length} key(s)) — verifying GoTrue JWTs via ES256`);
      }
    } catch (err) {
      fastify.log.warn({ err }, '[auth] JWKS fetch failed — falling back to HS256');
    }
  }

  if (!supabaseVerifier && supabaseSecret) {
    supabaseVerifier = createSupabaseVerifier({ secret: supabaseSecret, audience });
    fastify.log.info('[auth] SUPABASE_JWT_SECRET set — verifying GoTrue JWTs via HS256');
  }

  if (!supabaseVerifier) {
    fastify.log.warn('[auth] No Supabase config — using legacy @fastify/jwt verification');
  }

  fastify.decorate('supabaseVerifier', supabaseVerifier);

  // Shared verification: GoTrue path first (if configured), else legacy @fastify/jwt. BOTH paths
  // then consult the denylist. Throws on invalid/expired/revoked.
  fastify.decorate('verifyBearer', async function (token: string): Promise<VerifiedIdentity> {
    let identity: VerifiedIdentity;
    if (supabaseVerifier) {
      identity = await supabaseVerifier(token); // throws on bad sig / exp / aud
    } else {
      const payload = fastify.jwt.verify<TokenPayload>(token); // throws on bad sig / exp
      identity = mapLegacyPayload(payload);
    }
    if (await denylist.isDenied(identity.revocationKey)) {
      throw new Error('Token revoked');
    }
    return identity;
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      // WebSocket upgrade requests cannot carry an Authorization header from browsers,
      // so accept the token as a query parameter (?token=...) as a fallback.
      const queryToken = (request.query as Record<string, string | undefined>).token;
      const token = extractBearer(request.headers.authorization) ?? queryToken?.trim() ?? undefined;
      if (!token) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }
      const identity = await fastify.verifyBearer(token);
      // Populate request.user so authorize() and handlers read the same shape as before.
      request.user = {
        userId: identity.userId,
        email: identity.email,
        name: identity.name,
        role: identity.role,
        tenant_id: identity.tenant_id,
        tenant_name: identity.tenant_name,
      };
      request.tenantId = identity.tenant_id;
      request.revocationKey = identity.revocationKey;
      request.revocationTtlSeconds = identity.remainingTtlSeconds;
    } catch (err) {
      fastify.log.warn({ err }, '[auth] token verification failed');
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.decorate('authorize', (permission: string) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      const { role } = request.user;
      const allowed = ROLE_PERMISSIONS[role] ?? [];
      if (!allowed.includes(permission) && role !== ROLES.PLATFORM_ADMIN) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    };
  });
});
