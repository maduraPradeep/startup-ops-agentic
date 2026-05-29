import type { FastifyPluginAsync } from 'fastify';
import { createSkillController } from '../../controllers/skill.controller.js';

// Phase 1b — mounted at /api/v1/admin/skills.
export const skillRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createSkillController(fastify);

  fastify.post('/compile',        { preHandler: fastify.authenticate }, ctrl.compile);
  fastify.post('/tokens/resolve', { preHandler: fastify.authenticate }, ctrl.resolveTokens);
};
