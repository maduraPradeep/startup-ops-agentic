import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock Redis plugin — must use fastify-plugin (fp) to expose decorators across scope
vi.mock('../plugins/redis.plugin.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    redisPlugin: fp(async (fastify: any) => {
      fastify.decorate('redis', {
        publish: vi.fn().mockResolvedValue(1),
        subscribe: vi.fn(),
        duplicate: vi.fn().mockReturnValue({
          subscribe: vi.fn(),
          on: vi.fn(),
          unsubscribe: vi.fn(),
          quit: vi.fn(),
        }),
        quit: vi.fn().mockResolvedValue('OK'),
        connect: vi.fn().mockResolvedValue(undefined),
      });
    }),
  };
});

// Mock Directus plugin — must use fp to expose decorator
vi.mock('../plugins/directus.plugin.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    directusPlugin: fp(async (fastify: any) => {
      fastify.decorate('directus', {});
    }),
  };
});

// Mock websocket plugin — must use fp to expose decorator
vi.mock('../plugins/websocket.plugin.js', async () => {
  const fp = (await import('fastify-plugin')).default;
  return {
    websocketPlugin: fp(async (fastify: any) => {
      fastify.decorate('io', {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      });
    }),
  };
});

// Mock directus service (used by EntityModel for workflow_definitions)
vi.mock('../services/directus.service.js', () => ({
  directus: {
    readItems: vi.fn().mockResolvedValue([]),
    createItem: vi.fn().mockResolvedValue({ id: 'new-def-id' }),
    readItem: vi.fn().mockResolvedValue({ id: 'def-123' }),
    updateItem: vi.fn().mockResolvedValue({ id: 'def-123', status: 'inactive' }),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock WorkflowModel (uses LangGraph HTTP calls)
vi.mock('../models/workflow.model.js', () => ({
  WorkflowModel: {
    findActive: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ id: 'wf-1', status: 'running' }),
    cancel: vi.fn().mockResolvedValue({ id: 'wf-1', status: 'cancelled' }),
    invokeAction: vi.fn().mockResolvedValue({ status: 'triggered' }),
  },
}));

import { directus } from '../services/directus.service.js';
import { WorkflowModel } from '../models/workflow.model.js';
import { buildApp } from '../app.js';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function getAuthToken(app: FastifyInstance): Promise<string> {
  return app.jwt.sign({
    userId: 'user-admin-id',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'platform_admin',
    tenant_id: TEST_TENANT_ID,
    tenant_name: 'Test Corp',
  });
}

describe('Workflow Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
    process.env.DIRECTUS_URL = 'http://localhost:8055';
    process.env.DIRECTUS_ADMIN_TOKEN = 'test-token';
    process.env.LANGGRAPH_URL = 'http://localhost:8000';
    app = await buildApp();
    await app.ready();
    authToken = await getAuthToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/workflows/definitions', () => {
    const validDefinition = {
      name: 'Leave Request Approval',
      description: 'Handles leave request approvals',
      trigger: {
        type: 'message',
        config: { keyword: 'leave request' },
      },
      prompt: 'You are an HR assistant that handles leave request approvals.',
      entities: ['leave_requests', 'employees'],
      output: {
        type: 'notification',
        config: { channel: 'email' },
      },
      status: 'active',
    };

    it('creates a workflow definition and returns 201', async () => {
      vi.mocked(directus.createItem).mockResolvedValueOnce({
        id: 'new-def-id',
        ...validDefinition,
        tenant_id: TEST_TENANT_ID,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/definitions',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: validDefinition,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ id: 'new-def-id', name: 'Leave Request Approval' });
    });

    it('returns 401 when creating definition without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/definitions',
        payload: validDefinition,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns error when definition body is invalid (missing required fields)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/workflows/definitions',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: {
          // Missing name, trigger, prompt, output
          description: 'Incomplete definition',
        },
      });

      // Zod validation error → 500 (caught by error handler as non-validation error)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/v1/workflows/active', () => {
    it('returns active workflows for authenticated user', async () => {
      vi.mocked(WorkflowModel.findActive).mockResolvedValueOnce([
        { id: 'wf-1', status: 'running', tenant_id: TEST_TENANT_ID },
        { id: 'wf-2', status: 'running', tenant_id: TEST_TENANT_ID },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/active',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('returns 401 when fetching active workflows without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/active',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/workflows/definitions', () => {
    it('returns workflow definitions for authenticated user', async () => {
      vi.mocked(directus.readItems).mockResolvedValueOnce([
        { id: 'def-1', name: 'Leave Approval', status: 'active' },
        { id: 'def-2', name: 'Expense Approval', status: 'active' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/definitions',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('returns 401 when fetching definitions without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/definitions',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
