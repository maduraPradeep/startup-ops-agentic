import type { FastifyRequest, FastifyReply } from 'fastify';
import { WorkflowModel } from '../models/workflow.model.js';
import { EntityModel } from '../models/entity.model.js';
import { CreateWorkflowDefinitionSchema } from '@ops/shared';

export const WorkflowController = {
  async listActive(request: FastifyRequest, reply: FastifyReply) {
    const data = await WorkflowModel.findActive(request.tenantId);
    return reply.send({ success: true, data });
  },

  async show(request: FastifyRequest, reply: FastifyReply) {
    const { workflowId } = request.params as { workflowId: string };
    const data = await WorkflowModel.findById(workflowId);
    return reply.send({ success: true, data });
  },

  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const { workflowId } = request.params as { workflowId: string };
    const data = await WorkflowModel.cancel(workflowId, request.user, request.tenantId);
    return reply.send({ success: true, data });
  },

  async listDefinitions(request: FastifyRequest, reply: FastifyReply) {
    const data = await EntityModel.findAll('workflow_definitions', request.tenantId);
    return reply.send({ success: true, data });
  },

  async createDefinition(request: FastifyRequest, reply: FastifyReply) {
    const parsed = CreateWorkflowDefinitionSchema.parse(request.body);
    const data = await EntityModel.create('workflow_definitions', parsed as any, request.tenantId);
    return reply.status(201).send({ success: true, data });
  },

  async deleteDefinition(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    // Just update to inactive for safety
    const data = await EntityModel.update('workflow_definitions', id, { status: 'inactive' });
    return reply.send({ success: true, data });
  },
};
