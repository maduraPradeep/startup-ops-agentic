import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const BroadcastSchema = z.object({
  title:      z.string().min(1).max(200),
  message:    z.string().min(1).max(5000),
  audience:   z.enum(['all', 'department', 'role']).default('all'),
  department: z.string().uuid().optional(),
  role:       z.string().optional(),
  priority:   z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  channels:   z.array(z.enum(['webchat', 'slack', 'email'])).default(['webchat']),
});

export function createBroadcastController(fastify: FastifyInstance) {
  return {
    async send(request: FastifyRequest, reply: FastifyReply) {
      const payload = BroadcastSchema.parse(request.body);
      const envelope = {
        ...payload,
        tenantId: request.tenantId,
        sentBy:   request.user,
        sentAt:   new Date().toISOString(),
      };

      await fastify.redis.publish(`broadcast:${request.tenantId}`, JSON.stringify(envelope));
      fastify.io.to(`tenant:${request.tenantId}`).emit('broadcast:new', payload);

      return reply.status(201).send({ success: true });
    },
  };
}
