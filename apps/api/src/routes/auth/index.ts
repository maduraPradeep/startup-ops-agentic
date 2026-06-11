import type { FastifyPluginAsync } from 'fastify';
import { createAuthController } from '../../controllers/auth.controller.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createAuthController(fastify);

  fastify.post('/login',   ctrl.login);
  fastify.post('/refresh', ctrl.refresh);
  fastify.post('/logout',  { preHandler: fastify.authenticate }, ctrl.logout);
};
