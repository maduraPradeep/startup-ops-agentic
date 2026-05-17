import type { FastifyInstance } from 'fastify';

interface NotificationPayload {
  tenantId: string;
  userId?: string;
  type: string;
  data: unknown;
}

export function createNotificationService(fastify: FastifyInstance) {
  return {
    async broadcast(payload: NotificationPayload): Promise<void> {
      const room = payload.userId
        ? `user:${payload.userId}`
        : `tenant:${payload.tenantId}`;

      fastify.io.to(room).emit(payload.type, payload.data);

      await fastify.redis.publish(
        `notifications:${payload.tenantId}`,
        JSON.stringify(payload)
      );
    },
  };
}
