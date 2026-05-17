import type { FastifyPluginAsync } from 'fastify';
import { createBroadcastController } from '../../controllers/broadcast.controller.js';

export const broadcastRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createBroadcastController(fastify);

  fastify.post('/', { preHandler: fastify.authorize('employees:read') }, ctrl.send);
};
