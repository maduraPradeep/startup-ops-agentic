import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getEntitySchema } from '@ops/shared';
import { EntityModel } from '../models/entity.model.js';
import { WorkflowModel } from '../models/workflow.model.js';
import { logAudit } from '../services/audit.service.js';

export function createEntityController(fastify: FastifyInstance) {
  return {
    async describe(request: FastifyRequest, reply: FastifyReply) {
      const { collection } = request.params as { collection: string };
      const data = await EntityModel.describe(collection);
      return reply.send(data);
    },

    async list(request: FastifyRequest, reply: FastifyReply) {
      const { collection } = request.params as { collection: string };
      const { page = 1, limit = 20, filter } = request.query as {
        page?: number; limit?: number; filter?: string;
      };

      const data = await EntityModel.findAll(collection, request.tenantId, {
        page,
        limit,
        meta: 'total_count',
        filter: filter ? JSON.parse(filter) : undefined,
      });

      return reply.send({ success: true, data });
    },

    async show(request: FastifyRequest, reply: FastifyReply) {
      const { collection, id } = request.params as { collection: string; id: string };
      const data = await EntityModel.findById(collection, id);
      return reply.send({ success: true, data });
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
      const { collection } = request.params as { collection: string };

      const schema = getEntitySchema(collection);
      const parsed = schema ? schema.parse(request.body) : request.body;

      const item = await EntityModel.create(
        collection,
        parsed as Record<string, unknown>,
        request.tenantId
      );

      await fastify.redis.publish(
        `entity:${collection}:created`,
        JSON.stringify({ tenantId: request.tenantId, item, actor: request.user })
      );

      await logAudit({
        tenant_id:   request.tenantId,
        actor_id:    request.user.userId,
        actor_email: request.user.email,
        action:      'create',
        collection,
        item_id:     (item as Record<string, unknown>)?.id as string | undefined,
        changes:     request.body,
      });

      return reply.status(201).send({ success: true, data: item });
    },

    async update(request: FastifyRequest, reply: FastifyReply) {
      const { collection, id } = request.params as { collection: string; id: string };

      const item = await EntityModel.update(collection, id, request.body as Record<string, unknown>);

      await fastify.redis.publish(
        `entity:${collection}:updated`,
        JSON.stringify({ tenantId: request.tenantId, item, actor: request.user })
      );

      await logAudit({
        tenant_id:   request.tenantId,
        actor_id:    request.user.userId,
        actor_email: request.user.email,
        action:      'update',
        collection,
        item_id:     id,
        changes:     request.body,
      });

      return reply.send({ success: true, data: item });
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

      await logAudit({
        tenant_id:   request.tenantId,
        actor_id:    request.user.userId,
        actor_email: request.user.email,
        action:      `executeAction:${action}`,
        collection,
        item_id:     id,
        changes:     request.body,
        metadata:    { result },
      });

      return reply.send({ success: true, data: result });
    },
  };
}
