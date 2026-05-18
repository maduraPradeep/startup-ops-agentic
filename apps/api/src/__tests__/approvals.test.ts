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

// Mock directus service
vi.mock('../services/directus.service.js', () => ({
  directus: {
    readItems: vi.fn().mockResolvedValue([]),
    createItem: vi.fn().mockResolvedValue({ id: 'audit-id' }),
    readItem: vi.fn().mockResolvedValue({ id: 'approval-123' }),
    updateItem: vi.fn().mockResolvedValue({ id: 'approval-123', status: 'approved' }),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { directus } from '../services/directus.service.js';
import { buildApp } from '../app.js';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = 'user-approver-id';

async function getAuthToken(app: FastifyInstance): Promise<string> {
  return app.jwt.sign({
    userId: TEST_USER_ID,
    email: 'approver@example.com',
    name: 'Approver User',
    role: 'manager',
    tenant_id: TEST_TENANT_ID,
    tenant_name: 'Test Corp',
  });
}

describe('Approval Routes', () => {
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

  describe('GET /api/v1/approvals/pending', () => {
    it('returns list of pending approvals for authenticated user', async () => {
      vi.mocked(directus.readItems).mockResolvedValueOnce([
        {
          id: 'approval-1',
          status: 'pending',
          approver: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          deadline: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'approval-2',
          status: 'pending',
          approver: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          deadline: '2026-06-05T00:00:00.000Z',
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/approvals/pending',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0]).toMatchObject({ id: 'approval-1', status: 'pending' });
    });

    it('returns 401 when no auth token provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/approvals/pending',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns empty list when no pending approvals exist', async () => {
      vi.mocked(directus.readItems).mockResolvedValueOnce([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/approvals/pending',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('POST /api/v1/approvals/:id/decide', () => {
    it('approves an approval and returns updated record', async () => {
      vi.mocked(directus.updateItem).mockResolvedValueOnce({
        id: 'approval-1',
        status: 'approved',
        approval_notes: 'Approved by manager',
        decided_by: TEST_USER_ID,
      });
      // audit log
      vi.mocked(directus.createItem).mockResolvedValueOnce({ id: 'audit-id' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/approvals/approval-1/decide',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { decision: 'approved', notes: 'Approved by manager' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ id: 'approval-1', status: 'approved' });
    });

    it('rejects an approval and returns updated record', async () => {
      vi.mocked(directus.updateItem).mockResolvedValueOnce({
        id: 'approval-2',
        status: 'rejected',
        approval_notes: 'Does not meet criteria',
        decided_by: TEST_USER_ID,
      });
      // audit log
      vi.mocked(directus.createItem).mockResolvedValueOnce({ id: 'audit-id' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/approvals/approval-2/decide',
        headers: { Authorization: `Bearer ${authToken}` },
        payload: { decision: 'rejected', notes: 'Does not meet criteria' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ status: 'rejected' });
    });

    it('returns 401 when deciding without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/approvals/approval-1/decide',
        payload: { decision: 'approved' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
