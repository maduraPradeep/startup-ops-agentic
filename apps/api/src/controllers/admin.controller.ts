import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EntityModel } from '../models/entity.model.js';

export function createAdminController(fastify: FastifyInstance) {
  return {
    async listTenants(_request: FastifyRequest, reply: FastifyReply) {
      const data = await EntityModel.describe('tenants')
        .then(() => EntityModel.findAll('tenants', '', { sort: ['name'] }))
        .catch(() => []);
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
