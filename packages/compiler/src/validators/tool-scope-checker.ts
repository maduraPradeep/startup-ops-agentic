// Phase 1a — agent tool-scope matching (spec §4.4 stage 5, §5.3, changelog #24).
//
// A scope grants a required permission when:
//   - scope === "*"                       (global)
//   - scope === required                  (exact)
//   - scope ends with ":*" and required starts with that prefix  (wildcard, e.g. employees:*)

export function scopeMatches(scopes: string[], required: string): boolean {
  return scopes.some((scope) => {
    if (scope === '*' || scope === required) return true;
    if (scope.endsWith(':*')) {
      const prefix = scope.slice(0, -1); // keep trailing ":" => "employees:"
      return required.startsWith(prefix);
    }
    return false;
  });
}
