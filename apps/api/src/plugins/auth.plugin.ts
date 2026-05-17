import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ROLES, ROLE_PERMISSIONS } from '@ops/shared';

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  tenant_id: string;
  tenant_name: string;
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
  }
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  fastify.decorate('authorize', (permission: string) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      const allowed = ROLE_PERMISSIONS[role] ?? [];
      if (!allowed.includes(permission) && role !== ROLES.PLATFORM_ADMIN) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    };
  });
});
