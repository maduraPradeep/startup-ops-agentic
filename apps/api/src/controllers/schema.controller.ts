import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { EntityNotFoundError } from '../services/schema-registry.service.js';
import type { FieldInput } from '../services/schema-builder.service.js';

// Phase 1b — Schema Builder + /describe (spec §3.3, §3.5).
// GET    /admin/schema/:entity                 → Tier1+Tier2 merged describe
// POST   /admin/schema/:entity/fields          → add Tier2 field (409 on conflict)
// PUT    /admin/schema/:entity/fields/:name     → update Tier2 field (404/409)

export function createSchemaController(fastify: FastifyInstance) {
  return {
    async describe(request: FastifyRequest, reply: FastifyReply) {
      const { entity } = request.params as { entity: string };
      try {
        const result = await fastify.schemaRegistry.describe(request.tenantId, entity);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof EntityNotFoundError) {
          return reply.status(404).send({ error: err.message });
        }
        throw err;
      }
    },

    async addField(request: FastifyRequest, reply: FastifyReply) {
      const { entity } = request.params as { entity: string };
      const body = (request.body ?? {}) as Partial<FieldInput>;
      if (!body.name || !body.field_type) {
        return reply.status(400).send({ error: 'name and field_type are required' });
      }
      try {
        const result = await fastify.schemaBuilder.addField(request.tenantId, entity, body as FieldInput);
        if (result.status === 'conflict') {
          return reply.status(409).send({
            error: `Field "${body.name}" already exists`,
            reason: result.reason,
            existing: result.existing,
          });
        }
        return reply.status(201).send({ field: result.field });
      } catch (err) {
        if (err instanceof EntityNotFoundError) {
          return reply.status(404).send({ error: err.message });
        }
        throw err;
      }
    },

    async updateField(request: FastifyRequest, reply: FastifyReply) {
      const { entity, name } = request.params as { entity: string; name: string };
      const body = (request.body ?? {}) as Omit<FieldInput, 'name'>;
      if (!body.field_type) {
        return reply.status(400).send({ error: 'field_type is required' });
      }
      try {
        const result = await fastify.schemaBuilder.updateField(request.tenantId, entity, name, body);
        if (result.status === 'not_found') {
          return reply.status(404).send({ error: `Tenant field "${name}" not found` });
        }
        if (result.status === 'conflict') {
          return reply.status(409).send({
            error: `Field "${name}" is a platform field and cannot be modified`,
            reason: result.reason,
            existing: result.existing,
          });
        }
        return reply.status(200).send({ field: result.field });
      } catch (err) {
        if (err instanceof EntityNotFoundError) {
          return reply.status(404).send({ error: err.message });
        }
        throw err;
      }
    },
  };
}
