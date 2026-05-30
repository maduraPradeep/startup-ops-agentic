import type { CompilationStage, ReactFlowNode, ReactFlowEdge, ParsedToken } from '@ops/shared';

// Phase 1b — Skill Editor shared constants + pure helpers. Mirrors lib/schema-builder.ts:
// presentational constants and small, unit-tested pure functions. No React, no I/O.

// The compiler runs synchronously (POST /admin/skills/compile returns the full CompilationResult
// in one response). We still present the pipeline as an ordered checklist so the operator can see
// exactly how far a *failed* compile got — `stage` on a CompilationError names the failing stage.
// Order matches the CompilationStage enum (compilation.ts) / spec §4.4.
export const COMPILATION_STAGES: { stage: CompilationStage; label: string }[] = [
  { stage: 'parse', label: 'Parse skill text' },
  { stage: 'cache_check', label: 'Check cache' },
  { stage: 'compile', label: 'Compile (LLM)' },
  { stage: 'structural_validate', label: 'Structural validation' },
  { stage: 'data_flow_validate', label: 'Data-flow validation' },
  { stage: 'generate_flow', label: 'Generate flow graph' },
];

export type StageStatus = 'done' | 'error' | 'pending';

/**
 * Derive a per-stage checklist status for a finished compile run. Pure.
 *
 * - success: every stage is `done`.
 * - error at stage S: every stage *before* S is `done`, S itself is `error`, the rest `pending`
 *   (the pipeline stopped there).
 * - idle (no result / failingStage undefined on a non-success): all `pending`.
 */
export function deriveStageStatuses(
  outcome: 'success' | 'error' | 'idle',
  failingStage?: CompilationStage,
): { stage: CompilationStage; label: string; status: StageStatus }[] {
  return COMPILATION_STAGES.map(({ stage, label }) => {
    if (outcome === 'success') return { stage, label, status: 'done' as StageStatus };
    if (outcome === 'idle' || !failingStage) return { stage, label, status: 'pending' as StageStatus };
    const failIdx = COMPILATION_STAGES.findIndex((s) => s.stage === failingStage);
    const thisIdx = COMPILATION_STAGES.findIndex((s) => s.stage === stage);
    if (thisIdx < failIdx) return { stage, label, status: 'done' as StageStatus };
    if (thisIdx === failIdx) return { stage, label, status: 'error' as StageStatus };
    return { stage, label, status: 'pending' as StageStatus };
  });
}

// Per-step-type node palette (UI-DESIGN.md §4.6 flow-graph table). Used by the hand-rolled
// read-only graph render (no `reactflow`). Falls back to a neutral gray for unknown step types
// so the LLM emitting an off-whitelist step still renders instead of crashing.
export const STEP_TYPE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  collect: { bg: 'bg-blue-50', border: 'border-blue-400', text: 'text-blue-700' },
  enrich: { bg: 'bg-purple-50', border: 'border-purple-400', text: 'text-purple-700' },
  entity_tool: { bg: 'bg-green-50', border: 'border-green-400', text: 'text-green-700' },
  notify: { bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-700' },
  start_agent: { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-700' },
  condition: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700' },
  human_input: { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700' },
  end: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-600' },
};

const NEUTRAL_STYLE = { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-600' };

export function stepTypeStyle(stepType: string) {
  return STEP_TYPE_STYLES[stepType] ?? NEUTRAL_STYLE;
}

// Colour per token kind for the inline token-status panel (UI-DESIGN §4.6 syntax colours).
export const TOKEN_KIND_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  entity: { bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'entity' },
  entity_field: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'field' },
  role: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'role' },
  agent: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'agent' },
  external_tool: { bg: 'bg-green-50', text: 'text-green-700', label: 'tool' },
  entity_tool: { bg: 'bg-green-50', text: 'text-green-700', label: 'entity tool' },
};

export function tokenKindStyle(kind: string) {
  return TOKEN_KIND_STYLES[kind] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: kind };
}

/**
 * Order a flow graph's nodes into a single top-to-bottom reading sequence for the hand-rolled
 * read-only render (we don't use `reactflow`). We sort primarily by the node's vertical position
 * (the layout the compiler emits already flows downward), then horizontal, then id — stable and
 * pure. Edges are rendered separately as connectors/labels between consecutive nodes. */
export function orderNodesForRender(nodes: ReactFlowNode[]): ReactFlowNode[] {
  return [...nodes].sort(
    (a, b) =>
      a.position.y - b.position.y ||
      a.position.x - b.position.x ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Build an adjacency lookup: for a given node id, the outgoing edges (target + optional label).
 * Lets the render show, under each node card, where control flows next (incl. branch labels on
 * `condition` nodes). Pure. */
export function outgoingEdgesByNode(
  edges: ReactFlowEdge[],
): Record<string, { target: string; label?: string }[]> {
  const map: Record<string, { target: string; label?: string }[]> = {};
  for (const e of edges) {
    (map[e.source] ??= []).push({ target: e.target, label: e.label });
  }
  return map;
}

/** A short human label for a parsed token (its raw form is canonical). Pure. */
export function tokenSummary(token: ParsedToken): string {
  return token.raw;
}
