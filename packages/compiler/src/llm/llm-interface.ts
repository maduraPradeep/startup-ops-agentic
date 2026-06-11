// Phase 1a — injectable compiler LLM (spec §4.4 step 4: "Call Claude Sonnet").
// The real implementation calls Claude Sonnet; Phase 1a injects a mock returning fixture IR.

export interface LLMClient {
  /** Given the compiler prompt, return a raw (untyped) LangGraph definition object. */
  compile(prompt: string): Promise<unknown>;
}
