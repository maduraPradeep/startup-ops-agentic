import { z } from 'zod';

// Phase 1a — token types (spec §4.3).

export const TokenKindSchema = z.enum([
  'entity',
  'entity_field',
  'role',
  'agent',
  'external_tool',
  'entity_tool',
]);
export type TokenKind = z.infer<typeof TokenKindSchema>;

export const ParsedTokenSchema = z.object({
  raw: z.string(), // the original @token text, e.g. "@tools:describe:people"
  kind: TokenKindSchema,
  entity: z.string().optional(), // entity / entity_field / entity_tool
  field: z.string().optional(), // entity_field only
  op: z.string().optional(), // entity_tool only
  name: z.string().optional(), // role / agent / external_tool
});
export type ParsedToken = z.infer<typeof ParsedTokenSchema>;

// Resolved context attached after a token is looked up in the registry. The `resolved`
// payload (schemas, io, pii_safe, is_destructive, tool_scopes, …) feeds the compiler
// prompt and the compilation cache hash.
export const ResolvedTokenContextSchema = z.object({
  raw: z.string(),
  kind: TokenKindSchema,
  resolved: z.record(z.unknown()),
});
export type ResolvedTokenContext = z.infer<typeof ResolvedTokenContextSchema>;
