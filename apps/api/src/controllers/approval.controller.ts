import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApprovalModel } from '../models/approval.model.js';

type DecideParams = {
  Params: { id: string };
  Body: { decision: 'approved' | 'rejected'; notes?: string };
};

export function createApprovalController(fastify: FastifyInstance) {
  return {
    async listPending(request: FastifyRequest, reply: FastifyReply) {
      const data = await ApprovalModel.findPending(request.tenantId, request.user.userId);
      return reply.send({ success: true, data });
    },

    async decide(request: FastifyRequest<DecideParams>, reply: FastifyReply) {
      const { id } = request.params;
      const { decision, notes } = request.body;

      const updated = await ApprovalModel.decide(id, decision, notes, request.user.userId);

      await fastify.redis.publish(
        'approval:decided',
        JSON.stringify({ tenantId: request.tenantId, approvalId: id, decision, actor: request.user })
      );

      fastify.io.to(`tenant:${request.tenantId}`).emit('approval:decided', { id, decision });

      return reply.send({ success: true, data: updated });
    },
  };
}
