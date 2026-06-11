import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export function createAdminController(fastify: FastifyInstance) {
  return {
    async listTenants(_request: FastifyRequest, reply: FastifyReply) {
      const data = fastify.db
        ? await fastify.db.query('SELECT * FROM tenants ORDER BY name')
        : [];
      return reply.send({ success: true, data });
    },

    async health(_request: FastifyRequest, reply: FastifyReply) {
      const [redisPing, dbOk] = await Promise.all([
        fastify.redis.ping(),
        fastify.db ? fastify.db.ping() : Promise.resolve(null),
      ]);
      return reply.send({
        status:    'ok',
        timestamp: new Date().toISOString(),
        services: {
          redis:    redisPing === 'PONG' ? 'ok' : 'error',
          database: dbOk === null ? 'unconfigured' : dbOk ? 'ok' : 'error',
        },
      });
    },
  };
}
