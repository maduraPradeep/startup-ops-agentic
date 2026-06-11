import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { extractBearer } from '../services/supabase-jwt.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

export const websocketPlugin = fp(async (fastify: FastifyInstance) => {
  const io = new Server(fastify.server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
      credentials: true,
    },
  });

  // Enforce auth on WS connect: verify the token (GoTrue or legacy) AND reject a revoked
  // revocation key (spec §11.1). Reuses fastify.verifyBearer so HTTP and WS share one code
  // path — a token revoked via POST /auth/logout is rejected here too.
  io.use(async (socket, next) => {
    const token = extractBearer(socket.handshake.auth.token as string | undefined);
    if (!token) return next(new Error('Authentication required'));
    try {
      const identity = await fastify.verifyBearer(token); // throws on invalid / expired / revoked
      // Stash the verified tenant so connection handlers trust it over client-supplied values.
      socket.data.tenantId = identity.tenant_id;
      socket.data.userId = identity.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const tenantId = (socket.data.tenantId as string | undefined) ?? socket.handshake.auth.tenantId;
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
    }

    socket.on('disconnect', () => {
      fastify.log.info({ socketId: socket.id }, 'Client disconnected');
    });
  });

  fastify.decorate('io', io);

  fastify.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  fastify.log.info('Socket.io initialized');
});
