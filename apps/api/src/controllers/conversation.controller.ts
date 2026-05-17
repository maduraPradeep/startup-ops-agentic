import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { MessageSchema } from '@ops/shared';
import { ConversationModel } from '../models/conversation.model.js';

export function createConversationController(fastify: FastifyInstance) {
  return {
    async list(request: FastifyRequest, reply: FastifyReply) {
      const data = await ConversationModel.findByTenant(request.tenantId);
      return reply.send({ success: true, data });
    },

    handleWebSocket(socket: WebSocket, request: FastifyRequest) {
      const tenantId = request.tenantId;
      const user     = request.user;

      socket.on('message', async (raw: Buffer) => {
        try {
          const message = MessageSchema.parse(JSON.parse(raw.toString()));

          const response = await ConversationModel.sendToAgent({
            conversationId: message.conversationId,
            content:        message.content,
            channel:        'webchat',
            tenantId,
            actor:          user,
          });

          socket.send(JSON.stringify({ type: 'message', data: response }));
        } catch {
          socket.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
        }
      });

      // Fan out Redis pub/sub to this socket
      const subscriber = fastify.redis.duplicate();
      subscriber.subscribe(`user:${user.userId}:messages`).catch((err: Error) =>
        fastify.log.error(err, 'Redis subscribe error')
      );
      subscriber.on('message', (_ch: string, msg: string) => socket.send(msg));

      socket.on('close', () => { subscriber.unsubscribe(); subscriber.quit(); });
    },

    async streamSSE(request: FastifyRequest, reply: FastifyReply) {
      const { conversationId } = request.params as { conversationId: string };

      reply.raw.setHeader('Content-Type',  'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection',    'keep-alive');

      const subscriber = fastify.redis.duplicate();
      await subscriber.subscribe(`conversation:${conversationId}`);
      subscriber.on('message', (_ch: string, data: string) =>
        reply.raw.write(`data: ${data}\n\n`)
      );

      request.raw.on('close', () => { subscriber.unsubscribe(); subscriber.quit(); });
    },
  };
}
