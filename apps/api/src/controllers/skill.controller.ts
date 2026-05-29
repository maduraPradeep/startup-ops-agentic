import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Phase 1b — POST /admin/skills/compile + /admin/skills/tokens/resolve (spec §10.2).
// Thin transport over SkillCompilerService; all logic lives in the service.

export function createSkillController(fastify: FastifyInstance) {
  return {
    async compile(request: FastifyRequest, reply: FastifyReply) {
      if (!fastify.skillCompiler) {
        return reply.status(503).send({ error: 'Skill compiler unavailable (ANTHROPIC_API_KEY unset)' });
      }
      const { skill_text, author_role } = (request.body ?? {}) as {
        skill_text?: string;
        author_role?: string;
      };
      if (typeof skill_text !== 'string' || skill_text.trim() === '') {
        return reply.status(400).send({ error: 'skill_text is required' });
      }

      const result = await fastify.skillCompiler.compile({
        tenantId: request.tenantId,
        skillText: skill_text,
        authorRole: author_role,
      });
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
  };
}
