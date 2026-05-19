import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createEntityController } from '../../controllers/entity.controller.js';

export const entityRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createEntityController(fastify);

  const authorizeCollection = (action: 'create' | 'update' | 'read') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      await fastify.authenticate(request, reply);
      const { collection } = request.params as { collection: string };
      await fastify.authorize(`${collection}:${action}`)(request, reply);
    };

  fastify.get('/:collection/describe',     { preHandler: fastify.authenticate },                    ctrl.describe);
  fastify.get('/:collection',              { preHandler: fastify.authenticate },                    ctrl.list);
  fastify.get('/:collection/:id',          { preHandler: fastify.authenticate },                    ctrl.show);
  fastify.post('/:collection',             { preHandler: authorizeCollection('create') },           ctrl.create);
  fastify.patch('/:collection/:id',        { preHandler: authorizeCollection('update') },           ctrl.update);
  fastify.post('/:collection/:id/:action', { preHandler: fastify.authenticate },                    ctrl.executeAction);
};
