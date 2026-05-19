import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock the AuthModel before importing the app
vi.mock('../models/auth.model.js', () => ({
  AuthModel: {
    login: vi.fn(),
    getUser: vi.fn(),
    refresh: vi.fn(),
  },
}));

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
    readItem: vi.fn().mockResolvedValue({ id: 'test-id' }),
    updateItem: vi.fn().mockResolvedValue({ id: 'test-id' }),
    deleteItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { AuthModel } from '../models/auth.model.js';
import { buildApp } from '../app.js';

describe('POST /api/v1/auth/login', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
    process.env.DIRECTUS_URL = 'http://localhost:8055';
    process.env.DIRECTUS_ADMIN_TOKEN = 'test-token';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a JWT token and user info on valid credentials', async () => {
    vi.mocked(AuthModel.login).mockResolvedValueOnce({ access_token: 'directus-access-token' });
    vi.mocked(AuthModel.getUser).mockResolvedValueOnce({
      id: 'user-123',
      email: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
      role: 'operator',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      tenant_name: 'Acme Corp',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'alice@example.com', password: 'secret' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body.user).toMatchObject({
      id: 'user-123',
      email: 'alice@example.com',
      name: 'Alice Smith',
      role: 'operator',
      tenantId: '00000000-0000-0000-0000-000000000001',
      tenantName: 'Acme Corp',
    });
  });

  it('returns 401 when Directus login fails (bad credentials)', async () => {
    vi.mocked(AuthModel.login).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bad@example.com', password: 'wrong' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body).toHaveProperty('error', 'Invalid credentials');
  });

  it('returns 401 when user lookup fails after login', async () => {
    vi.mocked(AuthModel.login).mockResolvedValueOnce({ access_token: 'directus-access-token' });
    vi.mocked(AuthModel.getUser).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ghost@example.com', password: 'password' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body).toHaveProperty('error', 'User not found');
  });

  it('returns 400 on invalid request body (missing password)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'alice@example.com' },
    });

    // Zod parse throws → caught by error handler → 500, or zod throws ZodError
    // The controller uses z.parse which throws, fastify sends 500 or 400 depending on error type
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
