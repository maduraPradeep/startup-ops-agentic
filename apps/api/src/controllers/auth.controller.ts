import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthModel } from '../models/auth.model.js';

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export function createAuthController(fastify: FastifyInstance) {
  return {
    async login(
      request: FastifyRequest<{ Body: { email: string; password: string } }>,
      reply: FastifyReply
    ) {
      const { email, password } = LoginSchema.parse(request.body);

      const tokens = await AuthModel.login(email, password);
      if (!tokens) return reply.status(401).send({ error: 'Invalid credentials' });

      const directusUser = await AuthModel.getUser(tokens.access_token);
      if (!directusUser) return reply.status(401).send({ error: 'User not found' });

      const fullName = `${directusUser.first_name ?? ''} ${directusUser.last_name ?? ''}`.trim();

      const token = fastify.jwt.sign({
        userId:      directusUser.id,
        email:       directusUser.email,
        name:        fullName,
        role:        directusUser.role,
        tenant_id:   directusUser.tenant_id   ?? 'default',
        tenant_name: directusUser.tenant_name ?? 'Default',
      });

      return reply.send({
        token,
        user: {
          id:         directusUser.id,
          email:      directusUser.email,
          name:       fullName,
          role:       directusUser.role,
          tenantId:   directusUser.tenant_id   ?? 'default',
          tenantName: directusUser.tenant_name ?? 'Default',
        },
      });
    },

    async refresh(
      request: FastifyRequest<{ Body: { refreshToken: string } }>,
      reply: FastifyReply
    ) {
      const { refreshToken } = request.body;
      const data = await AuthModel.refresh(refreshToken);
      if (!data) return reply.status(401).send({ error: 'Token refresh failed' });
      return reply.send(data);
    },
  };
}
