import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthModel } from '../models/auth.model.js';

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export function createAuthController(fastify: FastifyInstance) {
  return {
    async login(request: FastifyRequest, reply: FastifyReply) {
      const { email, password } = LoginSchema.parse(request.body);

      const tokens = await AuthModel.login(email, password);
      if (!tokens) return reply.status(401).send({ error: 'Invalid credentials' });

      const directusUser = await AuthModel.getUser(tokens.access_token);
      if (!directusUser) return reply.status(401).send({ error: 'User not found' });

      const fullName = `${directusUser.first_name ?? ''} ${directusUser.last_name ?? ''}`.trim();

      // Resolve tenant: prefer user's own tenant_id, fall back to dev seed UUID
      const DEV_TENANT_ID   = '00000000-0000-0000-0000-000000000001';
      const DEV_TENANT_NAME = 'Acme Corp';
      const tenantId   = directusUser.tenant_id   ?? DEV_TENANT_ID;
      const tenantName = directusUser.tenant_name ?? DEV_TENANT_NAME;

      const token = fastify.jwt.sign({
        userId:      directusUser.id,
        email:       directusUser.email,
        name:        fullName,
        role:        directusUser.role,
        tenant_id:   tenantId,
        tenant_name: tenantName,
      });

      return reply.send({
        token,
        user: {
          id:         directusUser.id,
          email:      directusUser.email,
          name:       fullName,
          role:       directusUser.role,
          tenantId,
          tenantName,
        },
      });
    },

    async refresh(request: FastifyRequest, reply: FastifyReply) {
      const { refreshToken } = request.body as { refreshToken: string };
      const data = await AuthModel.refresh(refreshToken);
      if (!data) return reply.status(401).send({ error: 'Token refresh failed' });
      return reply.send(data);
    },
  };
}
