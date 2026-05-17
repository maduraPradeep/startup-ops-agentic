import type { FastifyPluginAsync } from 'fastify';
import { ROLES } from '@ops/shared';
import { createAdminController } from '../../controllers/admin.controller.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createAdminController(fastify);

  fastify.addHook('preHandler', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (request.user?.role !== ROLES.PLATFORM_ADMIN) {
      return reply.status(403).send({ error: 'Platform admin access required' });
    }
  });

  fastify.get('/tenants', ctrl.listTenants);
  fastify.get('/health',  ctrl.health);
};
