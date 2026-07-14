import type { NodeData } from '../../types.ts';

export type NodeUpdateMap = Record<string, Partial<NodeData>>;

export function applyNodeUpdateMap(nodes: NodeData[], updates: NodeUpdateMap): NodeData[] {
  return nodes.map(node => updates[node.id] ? { ...node, ...updates[node.id] } : node);
}
