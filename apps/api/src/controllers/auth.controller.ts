import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthModel } from '../models/auth.model.js';

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const DEV_TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const DEV_TENANT_NAME = 'Acme Corp';

export function createAuthController(fastify: FastifyInstance) {
  return {
    async login(request: FastifyRequest, reply: FastifyReply) {
      const { email, password } = LoginSchema.parse(request.body);

      const session = await AuthModel.login(email, password);
      if (!session) return reply.status(401).send({ error: 'Invalid credentials' });

      const { user, access_token, refresh_token } = session;
      const app = user.app_metadata ?? {};

      const role        = (app.role as string | undefined)        ?? 'employee';
      const tenantId    = (app.tenant_id as string | undefined)   ?? DEV_TENANT_ID;
      const tenantName  = (app.tenant_name as string | undefined) ?? DEV_TENANT_NAME;
      const name        = (app.name as string | undefined)        ?? user.email;

      return reply.send({
        token:         access_token,
        refresh_token,
        user: { id: user.id, email: user.email, name, role, tenantId, tenantName },
      });
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
      const { refreshToken } = request.body as { refreshToken: string };
      const session = await AuthModel.refresh(refreshToken);
      if (!session) return reply.status(401).send({ error: 'Token refresh failed' });
      return reply.send({
        token:         session.access_token,
        refresh_token: session.refresh_token,
      });
    },

    async logout(request: FastifyRequest, reply: FastifyReply) {
      const key = request.revocationKey;
      if (!key) return reply.status(401).send({ error: 'Unauthorized' });
      const ttl = request.revocationTtlSeconds && request.revocationTtlSeconds > 0
        ? request.revocationTtlSeconds
        : 3600;
      await fastify.tokenDenylist.deny(key, ttl);
      return reply.send({ revoked: true });
    },
  };
}
