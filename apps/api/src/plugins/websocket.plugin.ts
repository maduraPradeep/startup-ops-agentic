import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';

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

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    next();
  });

  io.on('connection', (socket) => {
    const tenantId = socket.handshake.auth.tenantId;
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
