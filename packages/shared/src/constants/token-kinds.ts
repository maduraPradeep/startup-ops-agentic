// Phase 1a — @token scanning (spec §4.3, Appendix B).
//
// Five token kinds, distinguished by prefix:
//   @entity:people                  -> entity
//   @entity:people.linkedin_summary -> entity field
//   @role:owner                     -> role
//   @agent:onboarding               -> agent
//   @tool:linkedin_analyzer         -> external tool
//   @tools:describe:people          -> entity tool (op:entity)

export const TOKEN_PREFIXES = ['tools', 'tool', 'entity', 'role', 'agent'] as const;

export const TOKEN_PREFIX_SET: ReadonlySet<string> = new Set(TOKEN_PREFIXES);

// Generic scan: capture any @prefix:body so unknown prefixes can be reported as errors
// rather than silently ignored. The body is an identifier optionally followed by `.`/`:`
// separated identifiers (entity fields, entity tools). Separators must sit BETWEEN
// identifier chars, so trailing punctuation (".", ",", ")") is not swallowed.
export const TOKEN_SCAN_REGEX = /@([a-zA-Z]+):([A-Za-z0-9_]+(?:[.:][A-Za-z0-9_]+)*)/g;

// SQL / shell injection guard applied to compiled definitions (spec §4.4 stage 5).
export const INJECTION_REGEX = /(\bSELECT\b|\bDROP\b|\$\(|`)/i;
