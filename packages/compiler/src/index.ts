// Phase 1a — @ops/compiler public API.

export { compileSkill, type CompileOptions } from './compile-skill';
export { CompilationCache, computeHash } from './cache/compilation-cache';
export { compilationError, TokenError } from './errors';

// Pipeline stages (exported for focused testing / reuse).
export { parseTokens } from './parser/token-parser';
export { resolveTokens } from './parser/token-resolver';
export { buildCompilerPrompt, sortResolved } from './prompt/build-prompt';
export { validateStructural } from './validators/structural-validator';
export { validateDataFlow, type AuthorContext } from './validators/data-flow-validator';
export { scopeMatches } from './validators/tool-scope-checker';
export { generateReactFlow } from './flow/react-flow-generator';
export { detectWarnings } from './warnings/warning-detector';

// Registry + LLM abstractions and mocks.
export type { Registry } from './registry/registry-interface';
export { MockRegistry } from './registry/mock-registry';
export {
  ENTITY_FIXTURES,
  TOOL_FIXTURES,
  AGENT_FIXTURES,
  ROLE_FIXTURES,
} from './registry/fixtures';
export type { LLMClient } from './llm/llm-interface';
export { MockLLM, type MockResolver } from './llm/mock-llm';
export {
  ADD_EMPLOYEE_DEFINITION,
  sqlInjectionDefinition,
  badStepTypeDefinition,
  agentScopeDefinition,
  unknownTokenInOutputDefinition,
  piiLeakDefinition,
  HRIS_SYNC_NO_HITL_DEFINITION,
  HRIS_SYNC_WITH_HITL_DEFINITION,
} from './llm/fixtures';
