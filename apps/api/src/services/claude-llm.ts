import type { LLMClient } from '@ops/compiler';

// Phase 1b — the real compiler LLM (spec §4.4 step 4: "Call Claude Sonnet").
//
// Implements the @ops/compiler `LLMClient` interface, so it is a drop-in for MockLLM:
// `compile(prompt)` returns a raw (untyped) LangGraph definition object that the pipeline
// then validates. We call the Anthropic Messages API over fetch rather than pulling in the
// SDK (same precedent as the fetch-based Directus wrapper) and inject the transport so the
// network is mockable in tests. The deterministic compiler prompt is the user message; a
// fixed instruction sits in the cached system block (prompt caching keeps repeat compiles
// cheap — the system block is identical across every skill).

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MAX_TOKENS = 8192;

const SYSTEM_INSTRUCTION =
  'You are the skill compiler for an AI-native operations platform. ' +
  'Given the compiler prompt, output ONLY a single JSON object that is a valid LangGraph ' +
  'definition (entry_point, nodes, edges). Do not include prose, explanations, or markdown ' +
  'fences — emit raw JSON only.';

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
}

export interface ClaudeTransportContext {
  apiKey: string;
  baseUrl: string;
}

/** Sends one Messages request and returns the parsed response. Injectable for tests. */
export type ClaudeTransport = (
  request: ClaudeRequest,
  ctx: ClaudeTransportContext,
) => Promise<ClaudeResponse>;

export interface ClaudeLLMOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  /** Override the network layer (defaults to a fetch-based transport). */
  transport?: ClaudeTransport;
}

export class ClaudeLLM implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxTokens: number;
  private readonly transport: ClaudeTransport;

  constructor(opts: ClaudeLLMOptions) {
    if (!opts.apiKey) throw new Error('ClaudeLLM requires an apiKey (ANTHROPIC_API_KEY).');
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.transport = opts.transport ?? fetchTransport;
  }

  async compile(prompt: string): Promise<unknown> {
    const request: ClaudeRequest = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: [{ type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    };

    const response = await this.transport(request, { apiKey: this.apiKey, baseUrl: this.baseUrl });
    const text = response.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim();

    if (!text) {
      throw new Error('Claude returned no text content.');
    }
    return extractJson(text);
  }
}

/** Default transport: POST /v1/messages over fetch. */
const fetchTransport: ClaudeTransport = async (request, ctx) => {
  const res = await fetch(`${ctx.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ctx.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 500)}`);
  }
  return (await res.json()) as ClaudeResponse;
};

/**
 * Pull a JSON object out of the model's text. The system prompt asks for raw JSON, but we
 * defensively strip ```json fences and any surrounding prose by taking the outermost
 * brace-delimited span. Throws a clear error if no parseable object is found, so the
 * compiler reports `compile`/`invalid_definition` rather than crashing.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the outermost { ... } span.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error('Could not extract a JSON object from the Claude response.');
  }
}
