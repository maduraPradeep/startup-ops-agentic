import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  IllegalSkillTransitionError,
  SkillConflictError,
  SkillNotFoundError,
  SkillPreconditionError,
} from '../services/skill.service.js';

// Phase 1b — POST /admin/skills/compile + /admin/skills/tokens/resolve (spec §10.2).
// Phase 1c — skill CRUD + lifecycle routes (spec §4.7, PRD §8.4): create/list/get/update +
// validate/publish/rollback/archive. Thin transport over SkillCompilerService + SkillService.

/** Map a service-layer error to an HTTP reply; returns false if unrecognized (caller rethrows). */
function sendError(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof SkillNotFoundError) {
    reply.status(404).send({ error: err.message });
    return true;
  }
  if (err instanceof SkillConflictError || err instanceof IllegalSkillTransitionError) {
    reply.status(409).send({ error: err.message });
    return true;
  }
  if (err instanceof SkillPreconditionError) {
    reply.status(400).send({ error: err.message });
    return true;
  }
  return false;
}

export function createSkillController(fastify: FastifyInstance) {
  return {
    // ----- Compile / tokens (Phase 1b) -------------------------------------------------

    async compile(request: FastifyRequest, reply: FastifyReply) {
      if (!fastify.skillCompiler) {
        return reply.status(503).send({ error: 'Skill compiler unavailable (ANTHROPIC_API_KEY unset)' });
      }
      const { skill_text, author_role, skill_id } = (request.body ?? {}) as {
        skill_text?: string;
        author_role?: string;
        skill_id?: string;
      };
      if (typeof skill_text !== 'string' || skill_text.trim() === '') {
        return reply.status(400).send({ error: 'skill_text is required' });
      }

      const { result, compilationId } = await fastify.skillCompiler.compile({
        tenantId: request.tenantId,
        skillText: skill_text,
        authorRole: author_role,
        skillId: skill_id,
      });

      // A successful compile bound to a saved skill advances it to `compiled` and stages the
      // new compilation as the publish candidate. Best-effort: a missing/illegal skill must
      // not turn a valid compilation into an HTTP error.
      if (result.success && skill_id && compilationId) {
        try {
          await fastify.skills.markCompiled(request.tenantId, skill_id, compilationId);
        } catch (err) {
          if (!(err instanceof SkillNotFoundError || err instanceof IllegalSkillTransitionError)) {
            throw err;
          }
          fastify.log.warn({ err, skill_id }, '[skills] markCompiled skipped after compile');
        }
      }

      // A failed compilation is a successful HTTP response describing the failure.
      return reply.status(200).send(result);
    },

    async resolveTokens(request: FastifyRequest, reply: FastifyReply) {
      if (!fastify.skillCompiler) {
        return reply.status(503).send({ error: 'Skill compiler unavailable (ANTHROPIC_API_KEY unset)' });
      }
      const { skill_text } = (request.body ?? {}) as { skill_text?: string };
      if (typeof skill_text !== 'string') {
        return reply.status(400).send({ error: 'skill_text is required' });
      }
      return reply.status(200).send(fastify.skillCompiler.resolveTokens(skill_text));
    },

    // ----- CRUD (Phase 1c) -------------------------------------------------------------

    async list(request: FastifyRequest, reply: FastifyReply) {
      return reply.send({ data: await fastify.skills.list(request.tenantId) });
    },

    async get(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as { id: string };
      try {
        return reply.send(await fastify.skills.get(request.tenantId, id));
      } catch (err) {
        if (sendError(reply, err)) return;
        throw err;
      }
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
      const { name, skill_text, author_role } = (request.body ?? {}) as {
        name?: string;
        skill_text?: string;
        author_role?: string;
      };
      try {
        const skill = await fastify.skills.create(request.tenantId, {
          name: name ?? '',
          skillText: skill_text ?? '',
          authorRole: author_role,
        });
        return reply.status(201).send(skill);
      } catch (err) {
        if (sendError(reply, err)) return;
        throw err;
      }
    },

    async update(request: FastifyRequest, reply: FastifyReply) {
      const { id } = request.params as { id: string };
      const { name, skill_text } = (request.body ?? {}) as { name?: string; skill_text?: string };
      try {
        return reply.send(
          await fastify.skills.update(request.tenantId, id, { name, skillText: skill_text }),
        );
      } catch (err) {
        if (sendError(reply, err)) return;
        throw err;
      }
    },

    // ----- Lifecycle transitions (Phase 1c) --------------------------------------------

    validate: lifecycle((svc, t, id) => svc.validate(t, id)),
    publish: lifecycle((svc, t, id) => svc.publish(t, id)),
    rollback: lifecycle((svc, t, id) => svc.rollback(t, id)),
    archive: lifecycle((svc, t, id) => svc.archive(t, id)),
    restore: lifecycle((svc, t, id) => svc.restore(t, id)),
  };

  /** Build a `POST /:id/<action>` handler from a SkillService transition. */
  function lifecycle(
    fn: (svc: FastifyInstance['skills'], tenantId: string, id: string) => Promise<unknown>,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        return reply.send(await fn(fastify.skills, request.tenantId, id));
      } catch (err) {
        if (sendError(reply, err)) return;
        throw err;
      }
    };
  }
}
