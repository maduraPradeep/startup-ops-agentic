import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { authPlugin } from './plugins/auth.plugin.js';
import { directusPlugin } from './plugins/directus.plugin.js';
import { redisPlugin } from './plugins/redis.plugin.js';
import { tenantPlugin } from './plugins/tenant.plugin.js';
import { websocketPlugin } from './plugins/websocket.plugin.js';
import { platformPlugin } from './plugins/platform.plugin.js';

import { conversationRoutes } from './routes/conversations/index.js';
import { entityRoutes } from './routes/entities/index.js';
import { workflowRoutes } from './routes/workflows/index.js';
import { approvalRoutes } from './routes/approvals/index.js';
import { broadcastRoutes } from './routes/broadcast/index.js';
import { adminRoutes } from './routes/admin/index.js';
import { authRoutes } from './routes/auth/index.js';
import { skillRoutes } from './routes/skills/index.js';
import { schemaRoutes } from './routes/schema/index.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(helmet);
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  await app.register(redisPlugin);
  await app.register(directusPlugin);
  await app.register(authPlugin);
  await app.register(tenantPlugin);
  await app.register(websocket);
  await app.register(websocketPlugin);
  await app.register(platformPlugin);

  await app.register(authRoutes,         { prefix: '/api/v1/auth' });
  await app.register(conversationRoutes, { prefix: '/api/v1/conversations' });
  await app.register(entityRoutes,       { prefix: '/api/v1/entities' });
  await app.register(workflowRoutes,     { prefix: '/api/v1/workflows' });
  await app.register(approvalRoutes,     { prefix: '/api/v1/approvals' });
  await app.register(broadcastRoutes,    { prefix: '/api/v1/broadcast' });
  await app.register(adminRoutes,        { prefix: '/api/v1/admin' });
  await app.register(skillRoutes,        { prefix: '/api/v1/admin/skills' });
  await app.register(schemaRoutes,       { prefix: '/api/v1/admin/schema' });

  app.setErrorHandler(async (error: any, _req, reply) => {
    app.log.error(error);
    if (error.statusCode === 401) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: error.validation,
      });
    }
    return reply.status(error.statusCode ?? 500).send({
      error: error.message ?? 'Internal Server Error',
    });
  });

  return app;
}
