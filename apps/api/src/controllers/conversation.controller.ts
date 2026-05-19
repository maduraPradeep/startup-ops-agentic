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

    async handleWebSocket(socket: WebSocket, request: FastifyRequest) {
      const tenantId = request.tenantId;
      const user     = request.user;

      // Send existing conversation history to the client
      const conversationId = (request.query as Record<string, string>).conversationId;
      if (conversationId) {
        try {
          const messages = await ConversationModel.findMessages(conversationId);
          socket.send(JSON.stringify({ type: 'history', data: messages }));
        } catch (err) {
          fastify.log.error(err, 'Failed to load conversation history');
        }
      }

      socket.on('message', async (raw: Buffer) => {
        try {
          const message = MessageSchema.parse(JSON.parse(raw.toString()));

          // Persist human message
          await ConversationModel.saveMessage({
            conversation_id: message.conversationId,
            tenant_id:       tenantId,
            role:            'human',
            content:         message.content,
          });

          // Notify client that agent is typing
          socket.send(JSON.stringify({ type: 'agent:typing', data: { agent: 'orchestrator', typing: true } }));

          const response = await ConversationModel.sendToAgent({
            conversationId: message.conversationId,
            content:        message.content,
            channel:        'webchat',
            tenantId,
            actor:          user,
          });

          // Notify client that agent has stopped typing
          socket.send(JSON.stringify({ type: 'agent:typing', data: { agent: 'orchestrator', typing: false } }));

          // Persist agent response
          const responseContent =
            typeof response === 'object' && response !== null && 'content' in response
              ? String((response as Record<string, unknown>).content)
              : JSON.stringify(response);

          await ConversationModel.saveMessage({
            conversation_id: message.conversationId,
            tenant_id:       tenantId,
            role:            'agent',
            content:         responseContent,
            metadata:        response,
          });

          socket.send(JSON.stringify({ type: 'message', data: response }));
        } catch {
          socket.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
        }
      });

      const subscriber = fastify.redis.duplicate();
      subscriber.subscribe(`user:${user.userId}:messages`).catch((err: Error) =>
        fastify.log.error(err, 'Redis subscribe error')
      );
      subscriber.on('message', (_ch: string, msg: string) => socket.send(msg));
      socket.on('close', () => { subscriber.unsubscribe(); subscriber.quit(); });
    },
  };
}
