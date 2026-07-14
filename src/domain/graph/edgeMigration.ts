import type { NodeData } from '../../types';
import { getInputPorts, getNodePort, getOutputPorts } from '../nodes/nodeRegistry.ts';
import { resolveConnectionPorts } from './connectionRules.ts';
import {
  CURRENT_EDGE_SCHEMA_VERSION,
  type CanvasEdge,
  type PortDataType
} from './graphTypes.ts';

type WarningHandler = (message: string) => void;
type UnknownRecord = Record<string, unknown>;

const PORT_DATA_TYPES = new Set<PortDataType>(['text', 'image', 'video', 'audio', 'subject', 'script', 'storyboard', 'any']);

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

export function migrateCanvasEdge(
  rawEdge: unknown,
  index = 0,
  warn: WarningHandler = console.warn
): UnknownRecord & { schemaVersion: number } {
  const edge = asRecord(rawEdge);
  const sourceVersion = typeof edge.schemaVersion === 'number'
    ? edge.schemaVersion
    : CURRENT_EDGE_SCHEMA_VERSION;
  if (sourceVersion > CURRENT_EDGE_SCHEMA_VERSION) {
    warn(`Edge ${String(edge.id || index)} uses newer schema version ${sourceVersion}; preserving unknown fields.`);
  }
  return {
    ...edge,
    schemaVersion: sourceVersion
  };
}

function edgeKey(edge: Pick<CanvasEdge, 'sourceNodeId' | 'sourcePortId' | 'targetNodeId' | 'targetPortId'>): string {
  return [edge.sourceNodeId, edge.sourcePortId, edge.targetNodeId, edge.targetPortId].join('\u0000');
}

function deterministicLegacyEdgeId(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  index: number
): string {
  return `legacy-${sourceNodeId}-${sourcePortId}-${targetNodeId}-${targetPortId}-${index}`;
}

function fallbackLegacyPorts(sourceNode: NodeData, targetNode: NodeData) {
  const outputs = getOutputPorts(sourceNode.type).filter(port => port.enabled !== false);
  const inputs = getInputPorts(targetNode.type).filter(port => port.enabled !== false);
  for (const output of outputs) {
    const input = inputs.find(candidate =>
      output.dataType === candidate.dataType || output.dataType === 'any' || candidate.dataType === 'any'
    );
    if (input) return { sourcePort: output, targetPort: input };
  }
  return undefined;
}

function resolveLegacyPorts(
  sourceNode: NodeData,
  targetNode: NodeData,
  existingEdges: CanvasEdge[],
  warn: WarningHandler
) {
  if (String(targetNode.type) === '视频' && Array.isArray(targetNode.frameInputs)) {
    const explicitFrame = targetNode.frameInputs.find(frame => frame.nodeId === sourceNode.id);
    if (explicitFrame) {
      const sourcePortId = ['视频', '视频编辑器'].includes(String(sourceNode.type))
        ? 'last-frame-output'
        : 'image-output';
      const sourcePort = getNodePort(sourceNode.type, sourcePortId);
      const targetPort = getNodePort(targetNode.type, explicitFrame.order === 'start' ? 'start-frame' : 'end-frame');
      if (sourcePort && targetPort) return { sourcePort, targetPort };
    }
  }

  const resolution = resolveConnectionPorts(sourceNode, targetNode, existingEdges);
  if (resolution.valid) return resolution;

  const fallback = fallbackLegacyPorts(sourceNode, targetNode);
  if (fallback) {
    warn(`Legacy connection ${sourceNode.id} -> ${targetNode.id} used fallback compatible ports.`);
    return fallback;
  }

  warn(`Legacy connection ${sourceNode.id} -> ${targetNode.id} has no known port mapping; preserving it with legacy ports.`);
  return {
    sourcePort: {
      id: 'legacy-output',
      label: 'Legacy Output',
      direction: 'output' as const,
      dataType: 'any' as const
    },
    targetPort: {
      id: 'legacy-input',
      label: 'Legacy Input',
      direction: 'input' as const,
      dataType: 'any' as const,
      multiple: true,
      ordered: true
    }
  };
}

export function normalizeEdges(
  rawEdges: unknown,
  nodes: NodeData[],
  warn: WarningHandler = console.warn
): CanvasEdge[] {
  if (!Array.isArray(rawEdges)) return [];

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const seen = new Set<string>();
  const normalized: CanvasEdge[] = [];

  rawEdges.forEach((rawEdge, index) => {
    const edge = migrateCanvasEdge(rawEdge, index, warn);
    const sourceNodeId = typeof edge.sourceNodeId === 'string' ? edge.sourceNodeId : '';
    const targetNodeId = typeof edge.targetNodeId === 'string' ? edge.targetNodeId : '';
    const sourcePortId = typeof edge.sourcePortId === 'string' ? edge.sourcePortId : '';
    const targetPortId = typeof edge.targetPortId === 'string' ? edge.targetPortId : '';

    if (!sourceNodeId || !targetNodeId || !sourcePortId || !targetPortId) {
      warn(`Ignoring malformed edge at index ${index}.`);
      return;
    }

    const sourceNode = nodeById.get(sourceNodeId);
    const targetNode = nodeById.get(targetNodeId);
    if (!sourceNode || !targetNode) {
      warn(`Ignoring edge ${String(edge.id || index)} because one of its nodes does not exist.`);
      return;
    }

    const sourcePort = getNodePort(sourceNode.type, sourcePortId);
    const targetPort = getNodePort(targetNode.type, targetPortId);
    if (!sourcePort) warn(`Edge ${String(edge.id || index)} references unknown source port "${sourcePortId}".`);
    if (!targetPort) warn(`Edge ${String(edge.id || index)} references unknown target port "${targetPortId}".`);

    const dataType = typeof edge.dataType === 'string' && PORT_DATA_TYPES.has(edge.dataType as PortDataType)
      ? edge.dataType as PortDataType
      : sourcePort?.dataType || 'any';
    const candidate: CanvasEdge = {
      ...edge,
      schemaVersion: edge.schemaVersion,
      id: typeof edge.id === 'string' && edge.id
        ? edge.id
        : deterministicLegacyEdgeId(sourceNodeId, sourcePortId, targetNodeId, targetPortId, index),
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
      dataType,
      ...(typeof edge.order === 'number' ? { order: edge.order } : {}),
      ...(edge.metadata ? { metadata: { ...asRecord(edge.metadata) } } : {})
    };
    const key = edgeKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(candidate);
  });

  return normalized;
}

export function migrateParentIdsToEdges(
  nodes: NodeData[],
  warn: WarningHandler = console.warn
): CanvasEdge[] {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const edges: CanvasEdge[] = [];

  for (const targetNode of nodes) {
    for (const [index, sourceNodeId] of (targetNode.parentIds || []).entries()) {
      const sourceNode = nodeById.get(sourceNodeId);
      if (!sourceNode) {
        warn(`Legacy parent ${sourceNodeId} for node ${targetNode.id} does not exist.`);
        continue;
      }

      const { sourcePort, targetPort } = resolveLegacyPorts(sourceNode, targetNode, edges, warn);
      const samePortEdges = edges.filter(edge =>
        edge.targetNodeId === targetNode.id && edge.targetPortId === targetPort.id
      );
      edges.push({
        schemaVersion: CURRENT_EDGE_SCHEMA_VERSION,
        id: deterministicLegacyEdgeId(sourceNode.id, sourcePort.id, targetNode.id, targetPort.id, index),
        sourceNodeId: sourceNode.id,
        sourcePortId: sourcePort.id,
        targetNodeId: targetNode.id,
        targetPortId: targetPort.id,
        dataType: sourcePort.dataType,
        ...(targetPort.ordered ? { order: samePortEdges.length } : {}),
        metadata: { migratedFrom: 'parentIds', inferred: true }
      });
    }
  }

  return normalizeEdges(edges, nodes, warn);
}

export function getIncomingEdges(edges: CanvasEdge[], nodeId: string): CanvasEdge[] {
  return edges
    .map((edge, index) => ({ edge, index }))
    .filter(item => item.edge.targetNodeId === nodeId)
    .sort((a, b) => (a.edge.order ?? a.index) - (b.edge.order ?? b.index))
    .map(item => item.edge);
}

export function getOutgoingEdges(edges: CanvasEdge[], nodeId: string): CanvasEdge[] {
  return edges.filter(edge => edge.sourceNodeId === nodeId);
}

export function getInputEdgesByPort(edges: CanvasEdge[], nodeId: string, portId: string): CanvasEdge[] {
  return getIncomingEdges(edges, nodeId).filter(edge => edge.targetPortId === portId);
}

export function getOutputEdgesByPort(edges: CanvasEdge[], nodeId: string, portId: string): CanvasEdge[] {
  return edges.filter(edge => edge.sourceNodeId === nodeId && edge.sourcePortId === portId);
}

export function deriveParentIdsFromEdges(nodes: NodeData[], edges: CanvasEdge[]): Record<string, string[]> {
  const parentIdsByNode: Record<string, string[]> = Object.fromEntries(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    const parentIds = parentIdsByNode[edge.targetNodeId];
    if (parentIds && !parentIds.includes(edge.sourceNodeId)) parentIds.push(edge.sourceNodeId);
  }
  return parentIdsByNode;
}

export function syncLegacyParentIds(nodes: NodeData[], edges: CanvasEdge[]): NodeData[] {
  const parentIdsByNode = deriveParentIdsFromEdges(nodes, edges);
  return nodes.map(node => {
    const nextParentIds = parentIdsByNode[node.id] || [];
    if (sameArray(node.parentIds, nextParentIds)) return node;
    return { ...node, parentIds: nextParentIds };
  });
}

export function removeEdgesForNode(edges: CanvasEdge[], nodeId: string): CanvasEdge[] {
  return edges.filter(edge => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId);
}

function sameArray(left: unknown[] | undefined, right: unknown[] | undefined): boolean {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function connectionShapeChanged(previous: NodeData | undefined, next: NodeData): boolean {
  if (!previous) return true;
  return previous.type !== next.type ||
    previous.videoModel !== next.videoModel ||
    previous.videoMode !== next.videoMode ||
    !sameArray(previous.parentIds, next.parentIds) ||
    !sameArray(previous.frameInputs, next.frameInputs);
}

export function reconcileEdgesFromLegacyNodeChanges(
  previousNodes: NodeData[],
  nextNodes: NodeData[],
  currentEdges: CanvasEdge[],
  warn: WarningHandler = console.warn
): CanvasEdge[] {
  const previousById = new Map(previousNodes.map(node => [node.id, node]));
  const nextIds = new Set(nextNodes.map(node => node.id));
  const changedNodeIds = new Set(
    nextNodes
      .filter(node => connectionShapeChanged(previousById.get(node.id), node))
      .map(node => node.id)
  );
  const hasRemovedNodes = previousNodes.some(node => !nextIds.has(node.id));

  for (const edge of currentEdges) {
    const previousSource = previousById.get(edge.sourceNodeId);
    const nextSource = nextNodes.find(node => node.id === edge.sourceNodeId);
    if (nextSource && connectionShapeChanged(previousSource, nextSource)) {
      changedNodeIds.add(edge.targetNodeId);
    }
  }

  if (changedNodeIds.size === 0 && !hasRemovedNodes) return currentEdges;

  const retained = currentEdges.filter(edge =>
    nextIds.has(edge.sourceNodeId) &&
    nextIds.has(edge.targetNodeId) &&
    !changedNodeIds.has(edge.targetNodeId)
  );
  const derived = migrateParentIdsToEdges(nextNodes, warn)
    .filter(edge => changedNodeIds.has(edge.targetNodeId));

  return normalizeEdges([...retained, ...derived], nextNodes, warn);
}
