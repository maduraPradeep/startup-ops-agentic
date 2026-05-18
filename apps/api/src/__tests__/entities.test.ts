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

// Mock directus service (used by EntityModel and audit service)
vi.mock('../services/directus.service.js', () => ({
  directus: {
    readItems: vi.fn().mockResolvedValue([]),
    createItem: vi.fn().mockResolvedValue({ id: 'new-entity-id' }),
    readItem: vi.fn().mockResolvedValue({ id: 'entity-123' }),
    updateItem: vi.fn().mockResolvedValue({ id: 'entity-123', status: 'updated' }),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock WorkflowModel (used by executeAction)
vi.mock('../models/workflow.model.js', () => ({
  WorkflowModel: {
    invokeAction: vi.fn().mockResolvedValue({ status: 'triggered' }),
    findActive: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({ id: 'wf-1' }),
    cancel: vi.fn().mockResolvedValue({ status: 'cancelled' }),
  },
}));

import { directus } from '../services/directus.service.js';
import { buildApp } from '../app.js';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Helper: generate a signed JWT for tests
async function getAuthToken(app: FastifyInstance): Promise<string> {
  return app.jwt.sign({
    userId: 'user-test-id',
    email: 'tester@example.com',
    name: 'Test User',
    role: 'operator',
    tenant_id: TEST_TENANT_ID,
    tenant_name: 'Test Corp',
  });
}

describe('Entity Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
    process.env.DIRECTUS_URL = 'http://localhost:8055';
    process.env.DIRECTUS_ADMIN_TOKEN = 'test-token';
    app = await buildApp();
    await app.ready();
    authToken = await getAuthToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/entities/:collection', () => {
    it('returns a list of entities for authenticated user', async () => {
      vi.mocked(directus.readItems).mockResolvedValueOnce([
        { id: 'emp-1', name: 'Alice', tenant_id: TEST_TENANT_ID },
        { id: 'emp-2', name: 'Bob', tenant_id: TEST_TENANT_ID },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/entities/employees',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('returns 401 when no auth token provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/entities/employees',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns empty array when no entities exist', async () => {
      vi.mocked(directus.readItems).mockResolvedValueOnce([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/entities/employees',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('POST /api/v1/entities/:collection', () => {
    it('creates an entity and returns 201 with created item', async () => {
      // Use a collection not registered in the schema registry so the body
      // passes through without Zod validation (getEntitySchema returns null)
      const newNote = {
        title: 'Test Note',
        content: 'Some content',
        author: 'user-test-id',
      };

      vi.mocked(directus.createItem).mockResolvedValueOnce({
        id: 'new-note-id',
        ...newNote,
        tenant_id: TEST_TENANT_ID,
      });
      // audit log createItem call
      vi.mocked(directus.createItem).mockResolvedValueOnce({ id: 'audit-id' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/entities/notes',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: newNote,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ id: 'new-note-id' });
    });

    it('returns 401 when creating entity without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/entities/notes',
        payload: { title: 'Unauthorized' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/entities/:collection/:id/:action', () => {
    it('executes an action on an entity and returns result', async () => {
      const { WorkflowModel } = await import('../models/workflow.model.js');
      vi.mocked(WorkflowModel.invokeAction).mockResolvedValueOnce({ status: 'approved', workflowId: 'wf-99' });
      // audit log
      vi.mocked(directus.createItem).mockResolvedValueOnce({ id: 'audit-id' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/entities/leave_requests/req-123/approveRequest',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { notes: 'Looks good' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ status: 'approved' });
    });

    it('returns 401 when executing action without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/entities/leave_requests/req-123/approveRequest',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
