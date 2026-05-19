import type { FastifyPluginAsync } from 'fastify';
import { createConversationController } from '../../controllers/conversation.controller.js';

export const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createConversationController(fastify);

  fastify.get('/ws', { websocket: true }, async (socket, request) => {
    const token = (request.query as Record<string, string>).token;

    if (!token) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    try {
      const payload = fastify.jwt.verify(token) as {
        userId: string;
        email: string;
        name: string;
        role: string;
        tenant_id: string;
        tenant_name: string;
      };

      request.user = {
        userId:      payload.userId,
        email:       payload.email,
        name:        payload.name,
        role:        payload.role,
        tenant_id:   payload.tenant_id,
        tenant_name: payload.tenant_name,
      };
      request.tenantId = payload.tenant_id;
    } catch {
      socket.close(1008, 'Unauthorized');
      return;
    }

    await ctrl.handleWebSocket(socket, request);
  });

  fastify.get('/', { preHandler: fastify.authenticate }, ctrl.list);
};
