import type { FastifyPluginAsync } from 'fastify';
import { createSkillController } from '../../controllers/skill.controller.js';

// Phase 1b/1c — mounted at /api/v1/admin/skills (spec PRD §8.4).
export const skillRoutes: FastifyPluginAsync = async (fastify) => {
  const ctrl = createSkillController(fastify);
  const auth = { preHandler: fastify.authenticate };

  // Compile / token tooling (Phase 1b).
  fastify.post('/compile',        auth, ctrl.compile);
  fastify.post('/tokens/resolve', auth, ctrl.resolveTokens);

  // Execution bridge (Phase 1c) — registered before /:id so the static `executions`
  // segment is unambiguous.
  fastify.get('/executions',                  auth, ctrl.listExecutions);
  fastify.get('/executions/:execId',          auth, ctrl.getExecution);
  fastify.post('/executions/:execId/resume',  auth, ctrl.resumeExecution);

  // CRUD (Phase 1c).
  fastify.get('/',      auth, ctrl.list);
  fastify.post('/',     auth, ctrl.create);
  fastify.get('/:id',   auth, ctrl.get);
  fastify.patch('/:id', auth, ctrl.update);

  // Lifecycle transitions (Phase 1c).
  fastify.post('/:id/validate', auth, ctrl.validate);
  fastify.post('/:id/publish',  auth, ctrl.publish);
  fastify.post('/:id/rollback', auth, ctrl.rollback);
  fastify.post('/:id/archive',  auth, ctrl.archive);
  fastify.post('/:id/restore',  auth, ctrl.restore);
  fastify.post('/:id/execute',  auth, ctrl.execute);
};
