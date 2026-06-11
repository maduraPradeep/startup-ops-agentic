import { describe, it, expect } from 'vitest';
import type { ReactFlowNode, ReactFlowEdge } from '@ops/shared';
import {
  deriveStageStatuses,
  stepTypeStyle,
  orderNodesForRender,
  outgoingEdgesByNode,
} from './skill-editor';

const node = (id: string, y: number, x = 0): ReactFlowNode => ({
  id,
  type: 'default',
  position: { x, y },
  data: { label: id, step_type: 'collect' },
});

describe('deriveStageStatuses', () => {
  it('marks every stage done on success', () => {
    const out = deriveStageStatuses('success');
    expect(out.every((s) => s.status === 'done')).toBe(true);
    expect(out).toHaveLength(6);
  });

  it('marks every stage pending when idle', () => {
    expect(deriveStageStatuses('idle').every((s) => s.status === 'pending')).toBe(true);
  });

  it('marks stages before the failing stage done, the failing stage error, the rest pending', () => {
    const out = deriveStageStatuses('error', 'structural_validate');
    const byStage = Object.fromEntries(out.map((s) => [s.stage, s.status]));
    expect(byStage.parse).toBe('done');
    expect(byStage.cache_check).toBe('done');
    expect(byStage.compile).toBe('done');
    expect(byStage.structural_validate).toBe('error');
    expect(byStage.data_flow_validate).toBe('pending');
    expect(byStage.generate_flow).toBe('pending');
  });

  it('falls back to all pending when an error has no known failing stage', () => {
    expect(deriveStageStatuses('error').every((s) => s.status === 'pending')).toBe(true);
  });
});

describe('stepTypeStyle', () => {
  it('returns the mapped palette for a known step type', () => {
    expect(stepTypeStyle('entity_tool').border).toBe('border-green-400');
  });
  it('falls back to a neutral palette for an unknown step type', () => {
    expect(stepTypeStyle('mystery_step').bg).toBe('bg-gray-50');
  });
});

describe('orderNodesForRender', () => {
  it('orders top-to-bottom by y then x then id, without mutating input', () => {
    const input = [node('c', 200), node('a', 0), node('b', 100, 5), node('b2', 100, 1)];
    const out = orderNodesForRender(input);
    expect(out.map((n) => n.id)).toEqual(['a', 'b2', 'b', 'c']);
    expect(input.map((n) => n.id)).toEqual(['c', 'a', 'b', 'b2']);
  });
});

describe('outgoingEdgesByNode', () => {
  it('groups edges by source with target + optional label', () => {
    const edges: ReactFlowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'c', label: 'rejected' },
      { id: 'e3', source: 'b', target: 'c' },
    ];
    const map = outgoingEdgesByNode(edges);
    expect(map.a).toEqual([{ target: 'b', label: undefined }, { target: 'c', label: 'rejected' }]);
    expect(map.b).toEqual([{ target: 'c', label: undefined }]);
    expect(map.c).toBeUndefined();
  });
});
