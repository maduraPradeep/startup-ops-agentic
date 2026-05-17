import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getEntitySchema } from '@ops/shared';
import { EntityModel } from '../models/entity.model.js';
import { WorkflowModel } from '../models/workflow.model.js';

type DescribeParams  = { Params: { collection: string } };
type ListParams      = { Params: { collection: string }; Querystring: { page?: number; limit?: number; filter?: string } };
type ShowParams      = { Params: { collection: string; id: string } };
type CreateParams    = { Params: { collection: string }; Body: unknown };
type UpdateParams    = { Params: { collection: string; id: string }; Body: unknown };
type ActionParams    = { Params: { collection: string; id: string; action: string }; Body: unknown };

export function createEntityController(fastify: FastifyInstance) {
  return {
    async describe(request: FastifyRequest<DescribeParams>, reply: FastifyReply) {
      const data = await EntityModel.describe(request.params.collection);
      return reply.send(data);
    },

    async list(request: FastifyRequest<ListParams>, reply: FastifyReply) {
      const { collection } = request.params;
      const { page = 1, limit = 20, filter } = request.query;

      const data = await EntityModel.findAll(collection, request.tenantId, {
        page,
        limit,
        meta: 'total_count',
        filter: filter ? JSON.parse(filter) : undefined,
      });

      return reply.send({ success: true, data });
    },

    async show(request: FastifyRequest<ShowParams>, reply: FastifyReply) {
      const { collection, id } = request.params;
      const data = await EntityModel.findById(collection, id);
      return reply.send({ success: true, data });
    },

    async create(request: FastifyRequest<CreateParams>, reply: FastifyReply) {
      const { collection } = request.params;

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

      return reply.status(201).send({ success: true, data: item });
    },

    async update(request: FastifyRequest<UpdateParams>, reply: FastifyReply) {
      const { collection, id } = request.params;

      const item = await EntityModel.update(collection, id, request.body as Record<string, unknown>);

      await fastify.redis.publish(
        `entity:${collection}:updated`,
        JSON.stringify({ tenantId: request.tenantId, item, actor: request.user })
      );

      return reply.send({ success: true, data: item });
    },

    async executeAction(request: FastifyRequest<ActionParams>, reply: FastifyReply) {
      const { collection, id, action } = request.params;

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
