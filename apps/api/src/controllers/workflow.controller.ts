import type { FastifyRequest, FastifyReply } from 'fastify';
import { WorkflowModel } from '../models/workflow.model.js';

type WorkflowIdParams = { Params: { workflowId: string } };

export const WorkflowController = {
  async listActive(request: FastifyRequest, reply: FastifyReply) {
    const data = await WorkflowModel.findActive(request.tenantId);
    return reply.send({ success: true, data });
  },

  async show(request: FastifyRequest<WorkflowIdParams>, reply: FastifyReply) {
    const data = await WorkflowModel.findById(request.params.workflowId);
    return reply.send({ success: true, data });
  },

  async cancel(request: FastifyRequest<WorkflowIdParams>, reply: FastifyReply) {
    const data = await WorkflowModel.cancel(
      request.params.workflowId,
      request.user,
      request.tenantId
    );
    return reply.send({ success: true, data });
  },
};
