import type { FastifyPluginAsync } from 'fastify';
import { createEntityController } from '../../controllers/entity.controller.js';

export const entityRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createEntityController(fastify);

  fastify.get('/:collection/describe',     { preHandler: fastify.authenticate }, ctrl.describe);
  fastify.get('/:collection',              { preHandler: fastify.authenticate }, ctrl.list);
  fastify.get('/:collection/:id',          { preHandler: fastify.authenticate }, ctrl.show);
  fastify.post('/:collection',             { preHandler: fastify.authenticate }, ctrl.create);
  fastify.patch('/:collection/:id',        { preHandler: fastify.authenticate }, ctrl.update);
  fastify.post('/:collection/:id/:action', { preHandler: fastify.authenticate }, ctrl.executeAction);
};
