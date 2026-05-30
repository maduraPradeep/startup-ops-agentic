import type { FastifyPluginAsync } from 'fastify';
import { createConversationController } from '../../controllers/conversation.controller.js';

export const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createConversationController(fastify);

  fastify.get('/ws',                        { websocket: true, preHandler: fastify.authenticate }, ctrl.handleWebSocket);
  fastify.get('/stream/:conversationId',    { preHandler: fastify.authenticate }, ctrl.streamSSE);
  fastify.get('/',                          { preHandler: fastify.authenticate }, ctrl.list);
};
