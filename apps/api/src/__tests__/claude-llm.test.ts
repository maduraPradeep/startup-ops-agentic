import { describe, expect, it, vi } from 'vitest';
import { ClaudeLLM, extractJson, type ClaudeTransport } from '../services/claude-llm';

// Phase 1b — ClaudeLLM: prompt-cached request shape + robust JSON extraction.
// The network is injected, so these run with no API key and no HTTP.

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON embedded in prose via the outermost brace span', () => {
    expect(extractJson('Here is the def: {"a":1} — done.')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON object', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('ClaudeLLM.compile', () => {
  it('requires an apiKey', () => {
    expect(() => new ClaudeLLM({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('sends the prompt as the user message with a cached system block and extracts the JSON', async () => {
    const transport = vi.fn<ClaudeTransport>(async () => ({
      content: [{ type: 'text', text: '{"entry_point":"n1","nodes":[],"edges":[]}' }],
    }));
    const llm = new ClaudeLLM({ apiKey: 'sk-test', model: 'claude-sonnet-4-6', transport });

    const result = await llm.compile('COMPILER PROMPT');
    expect(result).toEqual({ entry_point: 'n1', nodes: [], edges: [] });

    const [request, ctx] = transport.mock.calls[0];
    expect(request.model).toBe('claude-sonnet-4-6');
    expect(request.messages).toEqual([{ role: 'user', content: 'COMPILER PROMPT' }]);
    expect(request.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(ctx.apiKey).toBe('sk-test');
  });

  it('concatenates multiple text blocks before extracting', async () => {
    const transport: ClaudeTransport = async () => ({
      content: [
        { type: 'text', text: '```json\n{"entry_point":' },
        { type: 'text', text: '"n1","nodes":[],"edges":[]}\n```' },
      ],
    });
    const llm = new ClaudeLLM({ apiKey: 'sk-test', transport });
    expect(await llm.compile('p')).toEqual({ entry_point: 'n1', nodes: [], edges: [] });
  });

  it('throws when the response has no text content', async () => {
    const transport: ClaudeTransport = async () => ({ content: [] });
    const llm = new ClaudeLLM({ apiKey: 'sk-test', transport });
    await expect(llm.compile('p')).rejects.toThrow(/no text/i);
  });
});
