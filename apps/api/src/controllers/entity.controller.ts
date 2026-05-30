import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EntityNotFoundError } from '../services/schema-registry.service.js';
import {
  EntityValidationError,
  RecordNotFoundError,
} from '../services/entity.service.js';
import { WorkflowModel } from '../models/workflow.model.js';

// Phase 1b — Entity System over Postgres (spec §3.6, §6). Backed by EntityService
// (the registry-driven, JSONB-hybrid store).
// Action invocation still delegates to WorkflowModel — real execution lands in 1c.

export function createEntityController(fastify: FastifyInstance) {
  function fail(reply: FastifyReply, err: unknown): FastifyReply {
    if (err instanceof EntityNotFoundError) {
      return reply.status(404).send({ error: err.message });
    }
    if (err instanceof RecordNotFoundError) {
      return reply.status(404).send({ error: err.message });
    }
    if (err instanceof EntityValidationError) {
      return reply.status(400).send({ error: err.message, fields: err.fields });
    }
    throw err;
  }

  return {
    async describe(request: FastifyRequest, reply: FastifyReply) {
      const { collection } = request.params as { collection: string };
      try {
        const data = await fastify.entities.describe(request.tenantId, collection);
        return reply.send(data);
      } catch (err) {
        return fail(reply, err);
      }
    },

    async list(request: FastifyRequest, reply: FastifyReply) {
      const { collection } = request.params as { collection: string };
      const { page, limit, filter } = request.query as {
        page?: number; limit?: number; filter?: string;
      };
      try {
        const result = await fastify.entities.list(request.tenantId, collection, {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          filter: filter ? JSON.parse(filter) : undefined,
        });
        return reply.send({ success: true, data: result.data, meta: result.meta });
      } catch (err) {
        return fail(reply, err);
      }
    },

    async show(request: FastifyRequest, reply: FastifyReply) {
      const { collection, id } = request.params as { collection: string; id: string };
      try {
        const data = await fastify.entities.get(request.tenantId, collection, id);
        return reply.send({ success: true, data });
      } catch (err) {
        return fail(reply, err);
      }
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
      const { collection } = request.params as { collection: string };
      try {
        const item = await fastify.entities.create(
          request.tenantId,
          collection,
          (request.body ?? {}) as Record<string, unknown>,
        );
        await fastify.redis.publish(
          `entity:${collection}:created`,
          JSON.stringify({ tenantId: request.tenantId, item, actor: request.user }),
        );
        return reply.status(201).send({ success: true, data: item });
      } catch (err) {
        return fail(reply, err);
      }
    },

    async update(request: FastifyRequest, reply: FastifyReply) {
      const { collection, id } = request.params as { collection: string; id: string };
      try {
        const item = await fastify.entities.update(
          request.tenantId,
          collection,
          id,
          (request.body ?? {}) as Record<string, unknown>,
        );
        await fastify.redis.publish(
          `entity:${collection}:updated`,
          JSON.stringify({ tenantId: request.tenantId, item, actor: request.user }),
        );
        return reply.send({ success: true, data: item });
      } catch (err) {
        return fail(reply, err);
      }
    },

    async executeAction(request: FastifyRequest, reply: FastifyReply) {
      const { collection, id, action } = request.params as {
        collection: string; id: string; action: string;
      };

      const result = await WorkflowModel.invokeAction({
        collection,
        entityId: id,
        action,
        payload: request.body,
        actor: request.user,
        tenantId: request.tenantId,
      });

      return reply.send({ success: true, data: result });
    },
  };
}
