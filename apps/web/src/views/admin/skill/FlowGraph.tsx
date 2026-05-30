import { GitBranch, ArrowDown, Workflow } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactFlowGraph } from '@ops/shared';
import {
  orderNodesForRender,
  outgoingEdgesByNode,
  stepTypeStyle,
} from '../../../lib/skill-editor';

interface Props {
  graph: ReactFlowGraph | null;
}

// Right panel: a READ-ONLY render of the compiler's react_flow_graph. The brief forbids adding
// `reactflow` (or any heavy graph dep), so this is hand-rolled: nodes laid out top-to-bottom as
// cards (colour-coded by step_type per UI-DESIGN §4.6), with the control-flow shown via vertical
// connectors and, for each node, the outgoing edges (targets + branch labels) listed beneath it.
// This is the "downside insurance"-free visual validation: enough to eyeball the compiled graph,
// without the editable FlowEditor (explicitly out of scope).
export function FlowGraph({ graph }: Props) {
  if (!graph) {
    return (
      <EmptyState
        title="No graph yet"
        body="Compile a skill to see its workflow rendered here as a read-only diagram."
      />
    );
  }

  const nodes = orderNodesForRender(graph.nodes);
  const outgoing = outgoingEdgesByNode(graph.edges);
  const nodeLabel = Object.fromEntries(graph.nodes.map((n) => [n.id, n.data.label]));

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="Empty graph"
        body="The compiled skill produced no steps to render."
      />
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <Workflow size={15} className="text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Flow graph</span>
        <span className="ml-auto text-xs text-gray-400">
          {nodes.length} step{nodes.length === 1 ? '' : 's'} · {graph.edges.length} edge
          {graph.edges.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ol className="flex flex-col items-stretch">
          {nodes.map((node, i) => {
            const style = stepTypeStyle(node.data.step_type);
            const edges = outgoing[node.id] ?? [];
            const isLast = i === nodes.length - 1;
            return (
              <li key={node.id} className="flex flex-col items-center">
                <div className={clsx('w-full rounded-xl border-2 px-3 py-2.5', style.bg, style.border)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {node.data.label}
                    </span>
                    <span
                      className={clsx(
                        'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium font-mono',
                        style.text,
                        'bg-white/70',
                      )}
                    >
                      {node.data.step_type}
                    </span>
                  </div>

                  {/* Outgoing branches with labels (e.g. condition: approved / rejected). */}
                  {edges.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {edges.map((e, j) => (
                        <li
                          key={`${node.id}-${e.target}-${j}`}
                          className="inline-flex items-center gap-1 text-[11px] text-gray-600"
                        >
                          <GitBranch size={11} className="text-gray-400 shrink-0" />
                          {e.label && (
                            <span className="font-medium text-gray-700">{e.label}:</span>
                          )}
                          <span className="text-gray-500">→ {nodeLabel[e.target] ?? e.target}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {!isLast && (
                  <ArrowDown size={16} className="text-gray-300 my-1.5 shrink-0" />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col items-center justify-center text-center px-6 py-16">
      <Workflow className="w-10 h-10 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-xs text-gray-400 mt-1 max-w-xs">{body}</p>
    </div>
  );
}
