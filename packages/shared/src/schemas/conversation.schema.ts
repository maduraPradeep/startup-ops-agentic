import { z } from 'zod';

export const AgentIdentityEnum = z.enum([
  'intake', 'orchestrator', 'policy', 'hr', 'project', 'finance', 'notification',
]);

export const MessageSchema = z.object({
  id: z.string().uuid().optional(),
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  sender: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('human'),
      id: z.string().uuid(),
      name: z.string(),
    }),
    z.object({
      type: z.literal('agent'),
      id: AgentIdentityEnum,
      name: z.string(),
      avatar: z.string(),
      color: z.string(),
    }),
  ]),
  payload: z.discriminatedUnion('type', [
    z.object({ type: z.literal('text') }),
    z.object({ type: z.literal('action_card'), card: z.unknown() }),
    z.object({ type: z.literal('workflow_status'), workflow: z.unknown() }),
    z.object({ type: z.literal('approval'), approval: z.unknown() }),
    z.object({ type: z.literal('broadcast'), broadcast: z.unknown() }),
  ]).optional(),
  timestamp: z.coerce.date().optional(),
  channel: z.enum(['webchat', 'slack', 'teams', 'email', 'mobile']),
});

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().optional(),
  messages: z.array(MessageSchema).default([]),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type AgentIdentity = z.infer<typeof AgentIdentityEnum>;
