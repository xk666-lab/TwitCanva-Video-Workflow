import type { NodeData } from '../types.ts';

function cloneNode(node: NodeData): NodeData {
  return JSON.parse(JSON.stringify(node)) as NodeData;
}

function createDefaultNodeId(): string {
  return Date.now().toString() + Math.random().toString(36).slice(2, 11);
}

export function getClipboardSourceNodes(
  nodes: NodeData[],
  selectedNodeIds: readonly string[],
  sourceNodeId?: string
): NodeData[] {
  const selectedIds = new Set(selectedNodeIds);
  const shouldCopySelection = selectedIds.size > 0 && (!sourceNodeId || selectedIds.has(sourceNodeId));
  const sourceNodes = shouldCopySelection
    ? nodes.filter(node => selectedIds.has(node.id))
    : nodes.filter(node => node.id === sourceNodeId);

  return sourceNodes.map(cloneNode);
}

export function createPastedNodes(
  clipboardNodes: readonly NodeData[],
  options: {
    offset?: number;
    idFactory?: () => string;
  } = {}
): NodeData[] {
  const offset = options.offset ?? 50;
  const idFactory = options.idFactory ?? createDefaultNodeId;

  return clipboardNodes.map(node => ({
    ...cloneNode(node),
    id: idFactory(),
    x: node.x + offset,
    y: node.y + offset,
    parentIds: undefined,
    groupId: undefined,
    activeTaskId: undefined,
    lastTaskId: undefined,
    generationProgress: undefined,
    generationProgressMessage: undefined,
    generationStartTime: undefined
  }));
}
