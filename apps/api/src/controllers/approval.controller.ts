import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createApprovalModel } from '../models/approval.model.js';

export function createApprovalController(fastify: FastifyInstance) {
  const ApprovalModel = createApprovalModel(fastify.db);

  return {
    async listPending(request: FastifyRequest, reply: FastifyReply) {
      const data = await ApprovalModel.findPending(request.tenantId, request.user.userId);
      return reply.send({ success: true, data });
    },

    async decide(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as { id: string };
      const { decision, notes } = request.body as {
        decision: 'approved' | 'rejected'; notes?: string;
      };

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
