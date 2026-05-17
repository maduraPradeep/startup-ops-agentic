import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { directus } from '../services/directus.service.js';

export function createAdminController(fastify: FastifyInstance) {
  return {
    async listTenants(_request: FastifyRequest, reply: FastifyReply) {
      const data = await directus.readItems('tenants', { sort: ['name'] });
      return reply.send({ success: true, data });
    },

    async health(_request: FastifyRequest, reply: FastifyReply) {
      const ping = await fastify.redis.ping();
      return reply.send({
        status:    'ok',
        timestamp: new Date().toISOString(),
        services: {
          redis:    ping === 'PONG' ? 'ok' : 'error',
          directus: 'ok',
        },
      });
    },
  };
}
