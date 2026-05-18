import type { FastifyPluginAsync } from 'fastify';
import { WorkflowController } from '../../controllers/workflow.controller.js';

export const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/active',            { preHandler: fastify.authenticate }, WorkflowController.listActive);
  fastify.get('/:workflowId',       { preHandler: fastify.authenticate }, WorkflowController.show);
  fastify.post('/:workflowId/cancel', { preHandler: fastify.authenticate }, WorkflowController.cancel);

  // Workflow Definitions
  fastify.get('/definitions',      { preHandler: fastify.authenticate }, WorkflowController.listDefinitions);
  fastify.post('/definitions',     { preHandler: fastify.authenticate }, WorkflowController.createDefinition);
  fastify.delete('/definitions/:id', { preHandler: fastify.authenticate }, WorkflowController.deleteDefinition);
};
