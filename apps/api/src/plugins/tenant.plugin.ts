import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

export const tenantPlugin = fp(async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    // Public routes bypass tenant check
    const config = (request.routeOptions as any).config;
    if (config?.public) return;

    // Skip unauthenticated requests (auth plugin handles 401)
    if (!request.user) return;

    const tenantId = request.user.tenant_id;
    if (!tenantId) {
      return reply.status(401).send({ error: 'Tenant context missing' });
    }

    request.tenantId = tenantId;
  });
});
