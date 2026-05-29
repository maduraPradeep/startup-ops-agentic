import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { MockRegistry, type Registry } from '@ops/compiler';
import { SupabaseClient, resolveConnectionString } from '../db/supabase-client.js';
import { PostgresRegistry } from '../services/postgres-registry.js';
import { RedisCacheStore, InMemoryCacheStore, type CacheStore } from '../services/cache-store.js';
import {
  PostgresTenantFieldStore,
  InMemoryTenantFieldStore,
  type TenantFieldStore,
} from '../services/tenant-field-store.js';
import { SchemaRegistryService } from '../services/schema-registry.service.js';
import { SchemaBuilderService } from '../services/schema-builder.service.js';
import { EntityService } from '../services/entity.service.js';
import {
  PostgresEntityStore,
  InMemoryEntityStore,
  type EntityStore,
} from '../services/entity-store.js';
import { SkillCompilerService } from '../services/skill-compiler.service.js';
import { ClaudeLLM } from '../services/claude-llm.js';
import { PostgresCompilationStore } from '../services/compilation-store.js';

// Phase 1b — wires the compile slice into Fastify.
//
// Degrades gracefully so the app boots in dev/CI without full infra (mirrors how the
// registry-parity suite skips the Postgres leg when no DB is reachable):
//   - DB present  → PostgresRegistry + Postgres tenant-field/compilation stores
//   - DB absent   → MockRegistry + in-memory stores (the Phase 1a config seeds)
//   - Redis cache → RedisCacheStore (gzip) when fastify.redis exists, else in-memory
//   - LLM         → ClaudeLLM when ANTHROPIC_API_KEY is set, else null (compile → 503)

declare module 'fastify' {
  interface FastifyInstance {
    schemaRegistry: SchemaRegistryService;
    schemaBuilder: SchemaBuilderService;
    entities: EntityService;
    skillCompiler: SkillCompilerService | null;
  }
}

export const platformPlugin = fp(async (fastify: FastifyInstance) => {
  const connectionString = resolveConnectionString();

  let registry: Registry;
  let tenantFields: TenantFieldStore;
  let entityStore: EntityStore;
  let compilationStore: PostgresCompilationStore | undefined;

  if (connectionString) {
    const client = new SupabaseClient({ connectionString });
    registry = await PostgresRegistry.create(client);
    tenantFields = new PostgresTenantFieldStore(client);
    entityStore = new PostgresEntityStore(client);
    compilationStore = new PostgresCompilationStore(client);
    fastify.addHook('onClose', async () => {
      await client.close();
    });
    fastify.log.info('[platform] PostgresRegistry + Postgres stores active');
  } else {
    registry = new MockRegistry();
    tenantFields = new InMemoryTenantFieldStore();
    entityStore = new InMemoryEntityStore();
    fastify.log.warn('[platform] no DB configured — using MockRegistry + in-memory stores');
  }

  const cache: CacheStore = fastify.hasDecorator('redis')
    ? new RedisCacheStore(fastify.redis)
    : new InMemoryCacheStore();

  const schemaRegistry = new SchemaRegistryService(registry, tenantFields, cache);
  const schemaBuilder = new SchemaBuilderService(registry, tenantFields, schemaRegistry);
  const entities = new EntityService(schemaRegistry, entityStore);

  let skillCompiler: SkillCompilerService | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const llm = new ClaudeLLM({ apiKey, model: process.env.ANTHROPIC_MODEL });
    skillCompiler = new SkillCompilerService(registry, llm, { store: compilationStore });
    fastify.log.info('[platform] SkillCompilerService active (ClaudeLLM)');
  } else {
    fastify.log.warn('[platform] ANTHROPIC_API_KEY unset — POST /admin/skills/compile will 503');
  }

  fastify.decorate('schemaRegistry', schemaRegistry);
  fastify.decorate('schemaBuilder', schemaBuilder);
  fastify.decorate('entities', entities);
  fastify.decorate('skillCompiler', skillCompiler);
});
