import { describe, expect, it, vi } from 'vitest';
import {
  ADD_EMPLOYEE_DEFINITION,
  ADD_EMPLOYEE_SKILL,
  MockLLM,
  MockRegistry,
  UNKNOWN_ENTITY_SKILL,
} from '@ops/compiler';
import { SkillCompilerService, type CompilationStore } from '../services/skill-compiler.service';

// Phase 1b — POST /admin/skills/compile wrapper: shared cache → from_cache, persistence.

const TENANT = '00000000-0000-0000-0000-000000000001';

describe('SkillCompilerService.compile', () => {
  it('compiles Add Employee to success on the first call', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const service = new SkillCompilerService(new MockRegistry(), llm);

    const result = await service.compile({ tenantId: TENANT, skillText: ADD_EMPLOYEE_SKILL });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.from_cache).toBe(false);
      expect(result.compilation_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(llm.callCount).toBe(1);
  });

  it('returns from_cache:true on an identical re-compile without re-calling the LLM', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const service = new SkillCompilerService(new MockRegistry(), llm);

    const first = await service.compile({ tenantId: TENANT, skillText: ADD_EMPLOYEE_SKILL });
    const second = await service.compile({ tenantId: TENANT, skillText: ADD_EMPLOYEE_SKILL });

    expect(first.success && second.success).toBe(true);
    if (second.success) expect(second.from_cache).toBe(true);
    expect(llm.callCount).toBe(1); // LLM short-circuited by the cache
  });

  it('persists only real (non-cache-hit) compilations to the store', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const store: CompilationStore = { save: vi.fn(async () => {}) };
    const service = new SkillCompilerService(new MockRegistry(), llm, { store });

    await service.compile({ tenantId: TENANT, skillText: ADD_EMPLOYEE_SKILL });
    await service.compile({ tenantId: TENANT, skillText: ADD_EMPLOYEE_SKILL }); // cache hit
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it('returns a parse-stage failure for an unknown entity token', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const service = new SkillCompilerService(new MockRegistry(), llm);

    const result = await service.compile({ tenantId: TENANT, skillText: UNKNOWN_ENTITY_SKILL });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.stage).toBe('parse');
    expect(llm.callCount).toBe(0); // failed before reaching the LLM
  });
});

describe('SkillCompilerService.resolveTokens', () => {
  it('resolves all token kinds for a valid skill', () => {
    const service = new SkillCompilerService(new MockRegistry(), new MockLLM(ADD_EMPLOYEE_DEFINITION));
    const result = service.resolveTokens(ADD_EMPLOYEE_SKILL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.resolved.find((r) => r.raw === '@tool:linkedin_analyzer')?.resolved.pii_safe).toBe(false);
    }
  });

  it('returns a structured error for an unknown entity', () => {
    const service = new SkillCompilerService(new MockRegistry(), new MockLLM(ADD_EMPLOYEE_DEFINITION));
    const result = service.resolveTokens(UNKNOWN_ENTITY_SKILL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Unknown entity/);
  });
});
