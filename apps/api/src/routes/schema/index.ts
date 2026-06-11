import type { FastifyPluginAsync } from 'fastify';
import { createSchemaController } from '../../controllers/schema.controller.js';

// Phase 1b — mounted at /api/v1/admin/schema.
export const schemaRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createSchemaController(fastify);

  fastify.get('/:entity',                { preHandler: fastify.authenticate }, ctrl.describe);
  fastify.post('/:entity/fields',        { preHandler: fastify.authenticate }, ctrl.addField);
  fastify.put('/:entity/fields/:name',   { preHandler: fastify.authenticate }, ctrl.updateField);
};
