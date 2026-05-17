import type { FastifyRequest, FastifyReply } from 'fastify';
import { WorkflowModel } from '../models/workflow.model.js';

export const WorkflowController = {
  async listActive(request: FastifyRequest, reply: FastifyReply) {
    const data = await WorkflowModel.findActive(request.tenantId);
    return reply.send({ success: true, data });
  },

  async show(request: FastifyRequest, reply: FastifyReply) {
    const { workflowId } = request.params as { workflowId: string };
    const data = await WorkflowModel.findById(workflowId);
    return reply.send({ success: true, data });
  },

  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const { workflowId } = request.params as { workflowId: string };
    const data = await WorkflowModel.cancel(workflowId, request.user, request.tenantId);
    return reply.send({ success: true, data });
  },
};
