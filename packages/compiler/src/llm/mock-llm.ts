import type { LLMClient } from './llm-interface';

// Phase 1a — mock compiler LLM. Returns a caller-supplied definition (object or function of
// the prompt). `callCount` lets tests assert the cache short-circuits the LLM call.

export type MockResolver = unknown | ((prompt: string) => unknown);

export class MockLLM implements LLMClient {
  callCount = 0;

  constructor(private resolver: MockResolver) {}

  async compile(prompt: string): Promise<unknown> {
    this.callCount++;
    if (typeof this.resolver === 'function') {
      return (this.resolver as (p: string) => unknown)(prompt);
    }
    // Deep clone so callers can't accidentally mutate the fixture across calls.
    return structuredClone(this.resolver);
  }
}
