import type { FastifyPluginAsync } from 'fastify';
import { WorkflowController } from '../../controllers/workflow.controller.js';

export const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/',                  { preHandler: fastify.authenticate }, WorkflowController.listActive);
  fastify.get('/:workflowId',       { preHandler: fastify.authenticate }, WorkflowController.show);
  fastify.post('/:workflowId/cancel', { preHandler: fastify.authenticate }, WorkflowController.cancel);
};
