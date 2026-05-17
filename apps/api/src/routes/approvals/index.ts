import type { FastifyPluginAsync } from 'fastify';
import { createApprovalController } from '../../controllers/approval.controller.js';

export const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createApprovalController(fastify);

  fastify.get('/pending',     { preHandler: fastify.authenticate }, ctrl.listPending);
  fastify.post('/:id/decide', { preHandler: fastify.authenticate }, ctrl.decide);
};
