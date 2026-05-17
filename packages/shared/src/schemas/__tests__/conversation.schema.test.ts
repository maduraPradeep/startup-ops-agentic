import { describe, it, expect } from 'vitest';
import { MessageSchema } from '../conversation.schema';

const humanMessage = {
  conversationId: '550e8400-e29b-41d4-a716-446655440000',
  content: 'I need to request annual leave',
  sender: {
    type: 'human' as const,
    id:   '550e8400-e29b-41d4-a716-446655440001',
    name: 'Jane Smith',
  },
  channel: 'webchat' as const,
};

const agentMessage = {
  conversationId: '550e8400-e29b-41d4-a716-446655440000',
  content: "I'll help you with that leave request.",
  sender: {
    type:   'agent' as const,
    id:     'intake' as const,
    name:   'Intake Agent',
    avatar: '🤖',
    color:  '#6366f1',
  },
  channel: 'webchat' as const,
};

describe('MessageSchema', () => {
  it('parses a human message', () => {
    expect(MessageSchema.safeParse(humanMessage).success).toBe(true);
  });

  it('parses an agent message', () => {
    expect(MessageSchema.safeParse(agentMessage).success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = MessageSchema.safeParse({ ...humanMessage, content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects content longer than 10000 chars', () => {
    const result = MessageSchema.safeParse({ ...humanMessage, content: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('rejects unknown sender type', () => {
    const result = MessageSchema.safeParse({
      ...humanMessage,
      sender: { type: 'bot', id: '123', name: 'Bot' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown channel', () => {
    const result = MessageSchema.safeParse({ ...humanMessage, channel: 'telegram' });
    expect(result.success).toBe(false);
  });

  it('accepts optional payload of type text', () => {
    const result = MessageSchema.safeParse({ ...humanMessage, payload: { type: 'text' } });
    expect(result.success).toBe(true);
  });
});
