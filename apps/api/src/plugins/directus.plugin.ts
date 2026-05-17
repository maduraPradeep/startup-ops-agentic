import fp from 'fastify-plugin';
import { createDirectus, rest, staticToken } from '@directus/sdk';
import type { FastifyInstance } from 'fastify';

// Permissive schema — lets any collection name through without type errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = Record<string, any[]>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DirectusSDKClient = ReturnType<typeof createDirectus<Schema>> & { request: (...args: any[]) => Promise<any> };

declare module 'fastify' {
  interface FastifyInstance {
    directus: DirectusSDKClient;
  }
}

export const directusPlugin = fp(async (fastify: FastifyInstance) => {
  const client = createDirectus<Schema>(process.env.DIRECTUS_URL!)
    .with(staticToken(process.env.DIRECTUS_ADMIN_TOKEN!))
    .with(rest());

  fastify.decorate('directus', client as DirectusSDKClient);
  fastify.log.info('Directus SDK initialized');
});
