import type { LangGraphDefinition, ReactFlowGraph } from '@ops/shared';

// Phase 1a — stage 7: render the IR into a React Flow graph for visual validation (spec §4.6).
// Simple vertical layout; the editable FlowEditor (downside insurance) can re-layout later.

const STEP_LABELS: Record<string, string> = {
  collect: '📝',
  enrich: '🔍',
  entity_tool: '⚙️',
  notify: '🔔',
  start_agent: '🤖',
  condition: '🔀',
  human_input: '👤',
  end: '✅',
};

export function generateReactFlow(def: LangGraphDefinition): ReactFlowGraph {
  const nodes = def.nodes.map((node, i) => ({
    id: node.id,
    type: 'default',
    position: { x: 0, y: i * 120 },
    data: {
      label: `${STEP_LABELS[node.step_type] ?? '•'} ${humanize(node.id)}`,
      step_type: node.step_type,
    },
  }));

  const edges = def.edges.map((edge, i) => ({
    id: `e${i}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    ...(edge.condition ? { label: edge.condition } : {}),
  }));

  return { nodes, edges };
}

function humanize(id: string): string {
  return id
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
